import { FieldPath, FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole, type RequiredCaller } from '../auth/require-role.js';
import { getActiveOffers } from '../offers/offer-cache.js';
import { getSearchClient, safeErrorMessage, withRetry } from '../search/algolia-client.js';
import { ALGOLIA_WRITE_KEY, productsIndexName } from '../search/algolia-config.js';
import { getCatalogLookup } from '../search/catalog-cache.js';
import { toSearchRecord, type ProductSearchRecord } from '../search/product-record.js';
import { NAMES_CHANGED_FIELD } from '../search/catalog-cache.js';
import {
  brandDeleteBlockedReason,
  offerNamesCatalogId,
  categoryDeleteBlockedReason,
  categoryPlacement,
  newCatalogId,
  readDeleteRequest,
  readReorderRequest,
  readSaveBrandRequest,
  readSaveCategoryRequest,
  RESERVED_CATEGORY_SLUGS,
  sortOrderFor,
} from './catalog-admin.js';
import { recountCatalog } from './catalog-counts.js';

/**
 * Admin Categories & Brands screen (ATS-245). Every write to `categories/{id}` and
 * `brands/{id}` from that page goes through these callables. The id is the slug, set once
 * from the name; the slug and a category's parent never change afterwards.
 */

export interface SaveCatalogItemResponse {
  readonly id: string;
  /** Products re-sent to search because the name changed. */
  readonly resynced: number;
}

export interface DeleteCatalogItemResponse {
  readonly id: string;
}

export interface ReorderCatalogResponse {
  readonly updated: number;
}

/** Categories and brands lists are small (about thirty); this is a safety cap. */
const MAX_LIST = 500;

export const saveCategory = onCall(
  adminCallableOptions({ timeoutSeconds: 120, secrets: [ALGOLIA_WRITE_KEY] }),
  async (request): Promise<SaveCatalogItemResponse> => {
    const actor = await requireRole(request, 'staff');
    const input = readSaveCategoryRequest(request.data);
    if (typeof input === 'string') throw new HttpsError('invalid-argument', input);
    const db = getFirestore();
    const collection = db.collection('categories');

    const result = await db.runTransaction(async (tx) => {
      if (input.id) {
        const ref = collection.doc(input.id);
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new HttpsError('not-found', 'This category no longer exists. Reload the page.');
        }
        const before = snap.data() ?? {};
        const renamed = before['name'] !== input.name;
        const shownChanged = before['published'] !== input.published;
        tx.update(ref, {
          name: input.name,
          description: input.description,
          image: input.image,
          ...(input.defaultWeightGrams !== undefined ? { defaultWeightGrams: input.defaultWeightGrams } : {}),
          ...(input.shopLabel !== undefined
            ? { shopLabel: input.shopLabel ? input.shopLabel : FieldValue.delete() }
            : {}),
          ...(input.sizeChart !== undefined ? { sizeChart: input.sizeChart } : {}),
          ...(input.detailsTitle !== undefined ? { detailsTitle: input.detailsTitle } : {}),
          published: input.published,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        });
        tx.create(db.collection('auditLogs').doc(), audit(actor, 'categories.update', input.id, input));
        return { id: input.id, created: false, renamed, shownChanged };
      }

      const [all, brands] = await Promise.all([
        tx.get(collection.select('path', 'depth', 'sortOrder', 'parentId').limit(MAX_LIST)),
        tx.get(db.collection('brands').select().limit(MAX_LIST)),
      ]);
      // Category and brand ids share one set of counts in settings/catalog, so they never repeat.
      const taken = new Set<string>([
        ...RESERVED_CATEGORY_SLUGS,
        ...all.docs.map((doc) => doc.id),
        ...brands.docs.map((doc) => doc.id),
      ]);
      const id = newCatalogId(input.name, taken);
      if (!id) {
        throw new HttpsError('invalid-argument', 'Use at least one letter or number in the name.');
      }
      let parent: { id: string; path: string; depth: number } | null = null;
      if (input.parentId) {
        const parentDoc = all.docs.find((doc) => doc.id === input.parentId);
        if (!parentDoc) {
          throw new HttpsError('not-found', 'The parent category no longer exists. Reload the page.');
        }
        const parentData = parentDoc.data();
        parent = {
          id: parentDoc.id,
          path: typeof parentData['path'] === 'string' ? parentData['path'] : parentDoc.id,
          depth: parentData['depth'] === 1 ? 1 : 0,
        };
      }
      const placement = categoryPlacement(id, parent);
      if (typeof placement === 'string') throw new HttpsError('invalid-argument', placement);
      const siblings = all.docs.filter((doc) => (doc.get('parentId') ?? null) === placement.parentId);
      const lastSort = siblings.reduce((max, doc) => {
        const value = doc.get('sortOrder');
        return typeof value === 'number' && value > max ? value : max;
      }, 0);

      tx.create(collection.doc(id), {
        id,
        slug: id,
        name: input.name,
        description: input.description,
        parentId: placement.parentId,
        ancestorIds: placement.ancestorIds,
        path: placement.path,
        depth: placement.depth,
        sortOrder: lastSort + 10,
        image: input.image,
        published: input.published,
        productCount: 0,
        ...(input.defaultWeightGrams !== undefined ? { defaultWeightGrams: input.defaultWeightGrams } : {}),
        ...(input.shopLabel ? { shopLabel: input.shopLabel } : {}),
        ...(input.sizeChart !== undefined ? { sizeChart: input.sizeChart } : {}),
        ...(input.detailsTitle !== undefined ? { detailsTitle: input.detailsTitle } : {}),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
        updatedBy: actor.uid,
      });
      tx.create(db.collection('auditLogs').doc(), audit(actor, 'categories.create', id, input));
      return { id, created: true, renamed: false, shownChanged: false };
    });

    if (result.created || result.renamed) await markNamesChanged(db);
    if (result.created || result.renamed || result.shownChanged) {
      await refreshCounts(db, { categoryIds: [result.id] });
    }
    const resynced = result.renamed ? await resyncSearch(db, 'categoryIds', result.id) : 0;
    return { id: result.id, resynced };
  },
);

export const deleteCategory = onCall(
  adminCallableOptions(),
  async (request): Promise<DeleteCatalogItemResponse> => {
    const actor = await requireRole(request, 'staff');
    const input = readDeleteRequest(request.data);
    if (typeof input === 'string') throw new HttpsError('invalid-argument', input);
    const db = getFirestore();
    const ref = db.collection('categories').doc(input.id);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const [products, subCategories] = await Promise.all([
        tx.get(db.collection('products').where('categoryIds', 'array-contains', input.id).count()),
        tx.get(db.collection('categories').where('parentId', '==', input.id).count()),
      ]);
      const offers = await offersNaming(db, 'categoryIds', input.id);
      const blocked = categoryDeleteBlockedReason(input.id, {
        products: products.data().count,
        subCategories: subCategories.data().count,
        offers,
      });
      if (blocked) throw new HttpsError('failed-precondition', blocked);
      tx.delete(ref);
      tx.create(db.collection('auditLogs').doc(), {
        action: 'categories.delete',
        actorUid: actor.uid,
        actorEmail: actor.email ?? actor.uid,
        targetId: input.id,
        before: snap.data() ?? {},
        at: FieldValue.serverTimestamp(),
      });
    });

    await markNamesChanged(db);
    await removeCountKey(db, 'categories', input.id);
    return { id: input.id };
  },
);

export const saveBrand = onCall(
  adminCallableOptions({ timeoutSeconds: 120, secrets: [ALGOLIA_WRITE_KEY] }),
  async (request): Promise<SaveCatalogItemResponse> => {
    const actor = await requireRole(request, 'staff');
    const input = readSaveBrandRequest(request.data);
    if (typeof input === 'string') throw new HttpsError('invalid-argument', input);
    const db = getFirestore();
    const collection = db.collection('brands');

    const result = await db.runTransaction(async (tx) => {
      if (input.id) {
        const ref = collection.doc(input.id);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'This brand no longer exists. Reload the page.');
        const before = snap.data() ?? {};
        const renamed = before['name'] !== input.name;
        const shownChanged = before['published'] !== input.published;
        tx.update(ref, {
          name: input.name,
          logo: input.logo,
          published: input.published,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        });
        tx.create(db.collection('auditLogs').doc(), audit(actor, 'brands.update', input.id, input));
        return { id: input.id, created: false, renamed, shownChanged };
      }

      const [all, categories] = await Promise.all([
        tx.get(collection.select('sortOrder').limit(MAX_LIST)),
        tx.get(db.collection('categories').select().limit(MAX_LIST)),
      ]);
      const id = newCatalogId(
        input.name,
        new Set([...all.docs.map((doc) => doc.id), ...categories.docs.map((doc) => doc.id)]),
      );
      if (!id) throw new HttpsError('invalid-argument', 'Use at least one letter or number in the name.');
      const lastSort = all.docs.reduce((max, doc) => {
        const value = doc.get('sortOrder');
        return typeof value === 'number' && value > max ? value : max;
      }, 0);
      tx.create(collection.doc(id), {
        id,
        slug: id,
        name: input.name,
        logo: input.logo,
        sortOrder: lastSort + 10,
        published: input.published,
        productCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
        updatedBy: actor.uid,
      });
      tx.create(db.collection('auditLogs').doc(), audit(actor, 'brands.create', id, input));
      return { id, created: true, renamed: false, shownChanged: false };
    });

    if (result.created || result.renamed) await markNamesChanged(db);
    if (result.created || result.renamed || result.shownChanged) {
      await refreshCounts(db, { brandIds: [result.id] });
    }
    const resynced = result.renamed ? await resyncSearch(db, 'brandId', result.id) : 0;
    return { id: result.id, resynced };
  },
);

export const deleteBrand = onCall(
  adminCallableOptions(),
  async (request): Promise<DeleteCatalogItemResponse> => {
    const actor = await requireRole(request, 'staff');
    const input = readDeleteRequest(request.data);
    if (typeof input === 'string') throw new HttpsError('invalid-argument', input);
    const db = getFirestore();
    const ref = db.collection('brands').doc(input.id);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const products = await tx.get(db.collection('products').where('brandId', '==', input.id).count());
      const offers = await offersNaming(db, 'brandId', input.id);
      const blocked = brandDeleteBlockedReason(input.id, products.data().count, offers);
      if (blocked) throw new HttpsError('failed-precondition', blocked);
      tx.delete(ref);
      tx.create(db.collection('auditLogs').doc(), {
        action: 'brands.delete',
        actorUid: actor.uid,
        actorEmail: actor.email ?? actor.uid,
        targetId: input.id,
        before: snap.data() ?? {},
        at: FieldValue.serverTimestamp(),
      });
    });

    await markNamesChanged(db);
    await removeCountKey(db, 'brands', input.id);
    return { id: input.id };
  },
);

/** Drag to reorder: the ids of one level (top-level categories, one parent's sub-categories, or brands). */
export const reorderCatalog = onCall(
  adminCallableOptions(),
  async (request): Promise<ReorderCatalogResponse> => {
    const actor = await requireRole(request, 'staff');
    const input = readReorderRequest(request.data);
    if (typeof input === 'string') throw new HttpsError('invalid-argument', input);
    const db = getFirestore();
    const refs = input.ids.map((id) => db.collection(input.kind).doc(id));

    return db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      if (snaps.some((snap) => !snap.exists)) {
        throw new HttpsError('not-found', 'Something in this list was changed. Reload the page.');
      }
      if (input.kind === 'categories') {
        const parents = new Set(snaps.map((snap) => snap.get('parentId') ?? null));
        if (parents.size > 1) {
          throw new HttpsError('invalid-argument', 'Categories can only move within their own level.');
        }
      }
      let updated = 0;
      snaps.forEach((snap, index) => {
        const next = sortOrderFor(index);
        if (snap.get('sortOrder') === next) return;
        tx.update(snap.ref, {
          sortOrder: next,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        });
        updated += 1;
      });
      if (updated > 0) {
        tx.create(db.collection('auditLogs').doc(), {
          action: `${input.kind}.reorder`,
          actorUid: actor.uid,
          actorEmail: actor.email ?? actor.uid,
          ids: input.ids,
          at: FieldValue.serverTimestamp(),
        });
      }
      return { updated };
    });
  },
);

function audit(
  actor: RequiredCaller,
  action: string,
  targetId: string,
  after: object,
): Record<string, unknown> {
  return {
    action,
    actorUid: actor.uid,
    actorEmail: actor.email ?? actor.uid,
    targetId,
    // Firestore rejects `undefined` values (e.g. an omitted defaultWeightGrams), so drop them.
    after: {
      ...Object.fromEntries(Object.entries(after).filter(([, value]) => value !== undefined)),
      id: targetId,
    },
    at: FieldValue.serverTimestamp(),
  };
}

/** Offers (any state) whose rules name this category or brand. */
async function offersNaming(db: Firestore, field: 'categoryIds' | 'brandId', id: string): Promise<number> {
  const snap = await db.collection('offers').limit(MAX_LIST).get();
  return snap.docs.filter((doc) => offerNamesCatalogId(doc.data(), field, id)).length;
}

/**
 * Tells every function instance that a category or brand name changed, so the search sync
 * reads the new names instead of its cached ones (`getCatalogLookup` compares this stamp).
 */
async function markNamesChanged(db: Firestore): Promise<void> {
  try {
    await db.doc('settings/catalog').set({ [NAMES_CHANGED_FIELD]: Date.now() }, { merge: true });
  } catch (error: unknown) {
    logger.error('Marking catalogue names as changed failed', { message: safeErrorMessage(error) });
  }
}

/** Scoped `settings/catalog` refresh. A failure is logged: the next product write recounts anyway. */
async function refreshCounts(
  db: Firestore,
  scope: { readonly categoryIds?: readonly string[]; readonly brandIds?: readonly string[] },
): Promise<void> {
  try {
    await recountCatalog(db, {
      categoryIds: scope.categoryIds ?? [],
      brandIds: scope.brandIds ?? [],
      types: [],
    });
  } catch (error: unknown) {
    logger.error('Catalogue recount after a categories/brands change failed', {
      scope,
      message: safeErrorMessage(error),
    });
  }
}

/** Drops a deleted category's or brand's key from `settings/catalog` (a field path, never a dotted key). */
async function removeCountKey(db: Firestore, field: 'categories' | 'brands', id: string): Promise<void> {
  try {
    await db
      .doc('settings/catalog')
      .update(new FieldPath(field, id), FieldValue.delete(), 'updatedAt', FieldValue.serverTimestamp());
  } catch (error: unknown) {
    // A missing settings/catalog doc has nothing to remove.
    logger.warn('Removing a deleted catalogue key from settings/catalog failed', {
      field,
      id,
      message: safeErrorMessage(error),
    });
  }
}

/**
 * After a rename: send every published product in that category or brand to search again, with
 * a fresh catalogue lookup (this run reads the new name, never the cached old one). Returns how
 * many were sent; a failure is logged and the admin can still use Rebuild Search.
 */
async function resyncSearch(db: Firestore, field: 'categoryIds' | 'brandId', id: string): Promise<number> {
  try {
    const [{ categoriesById, brandsById, playerNamesById }, offers] = await Promise.all([
      getCatalogLookup(db, true),
      getActiveOffers(db, true),
    ]);
    const base = db.collection('products').where('published', '==', true);
    const snap = await (
      field === 'categoryIds'
        ? base.where('categoryIds', 'array-contains', id)
        : base.where('brandId', '==', id)
    )
      .limit(2_000)
      .get();
    const now = new Date();
    const records: ProductSearchRecord[] = [];
    for (const doc of snap.docs) {
      const record = toSearchRecord(
        doc.id,
        doc.data(),
        categoriesById,
        brandsById,
        offers,
        now,
        playerNamesById,
      );
      if (record) records.push(record);
    }
    if (records.length === 0) return 0;
    const client = getSearchClient();
    const indexName = productsIndexName();
    await withRetry(() => client.saveObjects({ indexName, objects: records }), 'saveObjects:rename');
    return records.length;
  } catch (error: unknown) {
    logger.error('Search re-sync after a categories/brands rename failed', {
      field,
      id,
      message: safeErrorMessage(error),
    });
    return 0;
  }
}
