import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { LOCKABLE_FIELDS, type LockableField } from './lockable-fields.js';
import { descriptionToHtml } from './product-form.js';
import { assertImportIdle, assertKnownPlayers, categoryIdsFrom } from './product-form.fn.js';
import {
  colourSizes,
  colourSlugBase,
  MAX_MODEL_COLOURS,
  modelChanged,
  modelGroupFromName,
  parseProductModelRequest,
  parseSaveProductModelRequest,
  sharedSizeIds,
  versionOf,
  type ModelColourInput,
  type ProductModelResponse,
  type SaveProductModelResponse,
} from './product-model.js';
import { buildSearchTokens } from './search-tokens.js';
import { nextSlug } from './slug.js';
import { stockFields } from './stock.js';

const SLUG_ATTEMPTS = 30;

/** The colours of the product that holds `productId`, each with the version a save is checked against. */
export const getProductModel = onCall(
  adminCallableOptions(),
  async (request): Promise<ProductModelResponse> => {
    await requireRole(request, 'admin');
    const { productId } = parseProductModelRequest(request.data);
    const db = getFirestore();
    const snap = await db.collection('products').doc(productId).get();
    if (!snap.exists || !snap.updateTime) {
      throw new HttpsError('not-found', 'This product no longer exists.');
    }
    const group = modelGroupOf(snap.data());
    if (group === null) {
      return { modelGroup: null, colours: [{ id: snap.id, version: versionOf(snap.updateTime) }] };
    }
    const members = await db
      .collection('products')
      .where('modelGroup', '==', group)
      .limit(MAX_MODEL_COLOURS + 1)
      .get();
    if (members.size > MAX_MODEL_COLOURS) {
      throw new HttpsError('failed-precondition', 'This product has more than 12 colours. Ask for help.');
    }
    const colours = members.docs
      .filter((doc) => doc.updateTime)
      .map((doc) => ({ id: doc.id, version: versionOf(doc.updateTime) }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    return { modelGroup: group, colours };
  },
);

/**
 * Save a product and every colour of it in one transaction. Shared details go to every colour; each
 * colour keeps its own photos, stock per size, price (optional) and shown/hidden. A saved colour is
 * refused when it changed after the page loaded it.
 */
export const saveProductModel = onCall(
  adminCallableOptions(),
  async (request): Promise<SaveProductModelResponse> => {
    const actor = await requireRole(request, 'admin');
    const input = parseSaveProductModelRequest(request.data);
    const { shared } = input;
    const db = getFirestore();
    const products = db.collection('products');
    const sizeIds = sharedSizeIds(shared.sizes);

    return db.runTransaction(async (tx) => {
      const newColours = input.colours.filter((colour) => colour.version === null);
      const savedColours = input.colours.filter((colour) => colour.version !== null);
      if (newColours.length > 0) await assertImportIdle(tx, db);

      // Reads first: saved colours, the model's members, new ids, catalogue, players.
      const live = new Map<string, DocumentSnapshot>();
      for (const colour of savedColours) {
        const snap = await tx.get(products.doc(colour.productId));
        if (!snap.exists || !snap.updateTime || versionOf(snap.updateTime) !== colour.version) {
          modelChanged();
        }
        live.set(colour.productId, snap);
      }
      for (const colour of newColours) {
        const snap = await tx.get(products.doc(colour.productId));
        if (snap.exists) {
          throw new HttpsError('already-exists', 'This product was already saved. Reload the page.');
        }
      }

      const liveGroups = new Set([...live.values()].map((snap) => modelGroupOf(snap.data())));
      if (liveGroups.size > 1) modelChanged();
      const liveGroup = liveGroups.size === 1 ? [...liveGroups][0]! : null;
      if (liveGroup === null && savedColours.length > 1) modelChanged();
      if (liveGroup !== null) {
        const members = await tx.get(
          products.where('modelGroup', '==', liveGroup).limit(MAX_MODEL_COLOURS + 1),
        );
        if (members.docs.some((doc) => !live.has(doc.id))) modelChanged();
      }

      const categorySnap = await tx.get(db.collection('categories').doc(shared.categoryId));
      if (!categorySnap.exists) {
        throw new HttpsError('failed-precondition', 'That category no longer exists. Reload the page.');
      }
      const brandSnap = await tx.get(db.collection('brands').doc(shared.brandId));
      if (!brandSnap.exists) {
        throw new HttpsError('failed-precondition', 'That brand no longer exists. Reload the page.');
      }
      await assertKnownPlayers(tx, db, shared.players);
      const categoryIds = categoryIdsFrom(categorySnap.data() ?? {}, shared.categoryId);

      const modelGroup =
        liveGroup ?? (input.colours.length > 1 ? await claimModelGroup(tx, db, shared.name) : null);
      const withColour = input.colours.length > 1;
      const takenSlugs = new Set<string>();
      const newSlugs = new Map<string, string>();
      for (const colour of newColours) {
        const base = colourSlugBase(shared.name, colour.colors[0]!, withColour);
        const slug = await claimSlug(tx, db, base, takenSlugs);
        takenSlugs.add(slug);
        newSlugs.set(colour.productId, slug);
      }

      // New colours copy what the page left unsent from the first saved colour.
      const first = savedColours[0] ? live.get(savedColours[0].productId)?.data() : undefined;
      const searchTokens = buildSearchTokens(shared.name, modelGroup);
      const newArrivalUntil = shared.newArrivalUntil ? Timestamp.fromDate(shared.newArrivalUntil) : null;
      const sharedFields: DocumentData = {
        name: shared.name,
        summary: shared.summary,
        details: [...shared.details],
        type: shared.type,
        categoryId: shared.categoryId,
        categoryIds,
        brandId: shared.brandId,
        tags: [...shared.tags],
        marketingBadge: shared.marketingBadge,
        newArrivalUntil,
        searchTokens,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };

      const saved: { id: string; slug: string }[] = [];
      for (const colour of input.colours) {
        const ref = products.doc(colour.productId);
        const snap = live.get(colour.productId);
        const liveData = snap?.data() ?? null;
        const sized = colourSizes(liveData?.['options'] ?? [], shared.sizes, sizeIds, colour);
        const stock = stockFields(sized.stockBySize, sized.flatStock);
        const price = colour.ownPrice ?? { price: shared.price, compareAtPrice: shared.compareAtPrice };
        const own: DocumentData = {
          ...sharedFields,
          modelGroup,
          colors: [...colour.colors],
          images: colour.images.map((image) => ({ ...image })),
          published: colour.published,
          price: price.price,
          compareAtPrice: price.compareAtPrice,
          options: sized.options,
          stock: stock.stock,
          inStock: stock.inStock,
        };

        if (liveData === null) {
          const slug = newSlugs.get(colour.productId)!;
          const created: DocumentData = {
            ...own,
            id: colour.productId,
            slug,
            descriptionHtml:
              shared.description === undefined
                ? (first?.['descriptionHtml'] ?? null)
                : descriptionToHtml(shared.description),
            detailImages: [],
            currency: 'EGP',
            players: [...(shared.players ?? stringList(first?.['players']))],
            variants: [],
            lockedFields: [...LOCKABLE_FIELDS],
            source: null,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: actor.uid,
          };
          if (shared.gender !== null) created['gender'] = shared.gender;
          if (stock.stockBySize) created['stockBySize'] = stock.stockBySize;
          if (shared.weightGrams !== null) created['weightGrams'] = shared.weightGrams;
          tx.create(ref, created);
          saved.push({ id: colour.productId, slug });
          continue;
        }

        const patch: DocumentData = {
          ...own,
          gender: shared.gender === null ? FieldValue.delete() : shared.gender,
          weightGrams: shared.weightGrams === null ? FieldValue.delete() : shared.weightGrams,
          stockBySize: stock.stockBySize ?? FieldValue.delete(),
        };
        if (shared.description !== undefined) {
          patch['descriptionHtml'] = descriptionToHtml(shared.description);
        }
        if (shared.players !== undefined) patch['players'] = [...shared.players];
        const locks = changedLocks(liveData, colour, own, categoryIds);
        if (locks.length > 0) patch['lockedFields'] = FieldValue.arrayUnion(...locks);
        // No auditLogs entry yet, same as updateProduct and setProductStock.
        tx.update(ref, patch);
        const slug = liveData['slug'];
        saved.push({ id: colour.productId, slug: typeof slug === 'string' ? slug : '' });
      }

      return { anchorId: input.anchorId ?? input.colours[0]!.productId, modelGroup, colours: saved };
    });
  },
);

/** A new model name from the product name, made unique among the models already in use. */
async function claimModelGroup(tx: Transaction, db: Firestore, name: string): Promise<string> {
  const base = modelGroupFromName(name);
  const taken = new Set<string>();
  let candidate = base;
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const snap = await tx.get(db.collection('products').where('modelGroup', '==', candidate).limit(1));
    if (snap.empty) return candidate;
    taken.add(candidate);
    candidate = nextSlug(base, taken);
  }
  throw new HttpsError('failed-precondition', 'Give this product a more specific name and try again.');
}

async function claimSlug(
  tx: Transaction,
  db: Firestore,
  base: string,
  claimed: ReadonlySet<string>,
): Promise<string> {
  const taken = new Set(claimed);
  let candidate = nextSlug(base, taken);
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const snap = await tx.get(db.collection('products').where('slug', '==', candidate).limit(1));
    if (snap.empty) return candidate;
    taken.add(candidate);
    candidate = nextSlug(base, taken);
  }
  return `${base}-${Date.now().toString(36)}`;
}

function changedLocks(
  live: DocumentData,
  colour: ModelColourInput,
  next: DocumentData,
  categoryIds: readonly string[],
): LockableField[] {
  const locks: LockableField[] = [];
  if (live['type'] !== next['type']) locks.push('type');
  if (live['brandId'] !== next['brandId']) locks.push('brandId');
  if (modelGroupOf(live) !== next['modelGroup']) locks.push('modelGroup');
  if (live['published'] !== colour.published) locks.push('published');
  if (!sameList(stringList(live['categoryIds']), categoryIds)) locks.push('categoryIds');
  if (!sameList(stringList(live['colors']), colour.colors)) locks.push('colors');
  if (!sameList(stringList(live['tags']), stringList(next['tags']))) locks.push('tags');
  return locks;
}

function modelGroupOf(data: DocumentData | undefined): string | null {
  const group = data?.['modelGroup'];
  return typeof group === 'string' && group.trim().length > 0 ? group : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
