import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { LOCKABLE_FIELDS, type LockableField } from './product-document.js';
import {
  descriptionToHtml,
  nextSizeOption,
  parseCreateProductRequest,
  parseUpdateProductRequest,
  type ProductFormInput,
  type SaveProductResponse,
} from './product-form.js';
import { buildSearchTokens } from './search-tokens.js';
import { nextSlug, slugBase } from './slug.js';
import { readSizeValueIds, stockFields } from './stock.js';

const IMPORT_LOCK_MS = 15 * 60 * 1000;
const SLUG_ATTEMPTS = 30;

export const createProduct = onCall(
  adminCallableOptions(),
  async (request): Promise<SaveProductResponse> => {
    const actor = await requireRole(request, 'admin');
    const input = parseCreateProductRequest(request.data);
    const db = getFirestore();
    const ref = db.collection('products').doc(input.productId);

    return db.runTransaction(async (tx) => {
      await assertImportIdle(tx, db);
      const existing = await tx.get(ref);
      if (existing.exists) {
        throw new HttpsError('already-exists', 'This product was already saved. Reload the page.');
      }
      const catalogue = await readCatalogue(tx, db, input);
      const slug = await claimSlug(tx, db, slugBase(input.slug ?? '', input.name));
      const { options, sizeIds } = nextSizeOption([], input.sizes);
      const stock =
        sizeIds.length > 0
          ? stockFields(
              Object.fromEntries(
                sizeIds.map((id, index) => [id, input.sizes[index]?.initialStock ?? 0]),
              ),
            )
          : stockFields(null, input.stock ?? 0);

      const created: DocumentData = {
        id: input.productId,
        slug,
        name: input.name,
        summary: input.summary,
        descriptionHtml: descriptionToHtml(input.description ?? null),
        detailImages: [],
        categoryId: input.categoryId,
        categoryIds: catalogue.categoryIds,
        type: input.type,
        brandId: input.brandId,
        modelGroup: input.modelGroup,
        currency: 'EGP',
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        images: input.images.map((image) => ({ ...image })),
        options,
        colors: [...input.colors],
        tags: [...input.tags],
        trackStock: true,
        variants: [],
        stock: stock.stock,
        inStock: stock.inStock,
        published: input.published,
        searchTokens: catalogue.searchTokens,
        lockedFields: [...LOCKABLE_FIELDS],
        source: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
        updatedBy: actor.uid,
      };
      if (stock.stockBySize) created['stockBySize'] = stock.stockBySize;
      if (typeof input.weightGrams === 'number') created['weightGrams'] = input.weightGrams;
      tx.create(ref, created);
      return { id: input.productId, slug };
    });
  },
);

export const updateProduct = onCall(
  adminCallableOptions(),
  async (request): Promise<SaveProductResponse> => {
    const actor = await requireRole(request, 'admin');
    const input = parseUpdateProductRequest(request.data);
    const db = getFirestore();
    const ref = db.collection('products').doc(input.productId);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'This product no longer exists. Reload the page.');
      }
      const live = snap.data() ?? {};
      const slug = live['slug'];
      if (typeof slug !== 'string' || slug.length === 0) {
        throw new HttpsError('not-found', 'This product no longer exists. Reload the page.');
      }
      assertPricePair(input.price, input.compareAtPrice);
      const catalogue = await readCatalogue(tx, db, input);
      const locks = changedLocks(live, input, catalogue.categoryIds);

      const patch: DocumentData = {
        name: input.name,
        summary: input.summary,
        type: input.type,
        categoryId: input.categoryId,
        categoryIds: catalogue.categoryIds,
        brandId: input.brandId,
        modelGroup: input.modelGroup,
        colors: [...input.colors],
        tags: [...input.tags],
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        published: input.published,
        images: input.images.map((image) => ({ ...image })),
        searchTokens: catalogue.searchTokens,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };
      if (input.description !== undefined) {
        patch['descriptionHtml'] = descriptionToHtml(input.description);
      }
      if (input.weightGrams !== undefined) {
        patch['weightGrams'] =
          input.weightGrams === null ? FieldValue.delete() : input.weightGrams;
      }
      if (locks.length > 0) patch['lockedFields'] = FieldValue.arrayUnion(...locks);
      applySizeAndStock(live, input, patch);

      // No auditLogs entry yet, same as setProductStock.
      tx.update(ref, patch);
      return { id: input.productId, slug };
    });
  },
);

async function assertImportIdle(tx: Transaction, db: Firestore): Promise<void> {
  const snap = await tx.get(db.doc('settings/catalog'));
  if (!snap.exists) return;
  const run = snap.get('importRun');
  if (!isPlainObject(run)) return;
  const atMs = timestampMillis(run['at']);
  if (atMs === null) return;
  if (Date.now() - atMs < IMPORT_LOCK_MS) {
    throw new HttpsError(
      'failed-precondition',
      'Products are being imported. Try again in a few minutes.',
    );
  }
}

async function claimSlug(tx: Transaction, db: Firestore, base: string): Promise<string> {
  const taken = new Set<string>();
  let candidate = base;
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const snap = await tx.get(db.collection('products').where('slug', '==', candidate).limit(1));
    if (snap.empty) return candidate;
    taken.add(candidate);
    candidate = nextSlug(base, taken);
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function readCatalogue(
  tx: Transaction,
  db: Firestore,
  input: ProductFormInput,
): Promise<{ categoryIds: string[]; searchTokens: readonly string[] }> {
  const categorySnap = await tx.get(db.collection('categories').doc(input.categoryId));
  if (!categorySnap.exists) {
    throw new HttpsError('failed-precondition', 'That category no longer exists. Reload the page.');
  }
  const brandSnap = await tx.get(db.collection('brands').doc(input.brandId));
  if (!brandSnap.exists) {
    throw new HttpsError('failed-precondition', 'That brand no longer exists. Reload the page.');
  }
  return {
    categoryIds: categoryIdsFrom(categorySnap.data() ?? {}, input.categoryId),
    searchTokens: buildSearchTokens(input.name, input.modelGroup),
  };
}

function categoryIdsFrom(data: DocumentData, categoryId: string): string[] {
  const ancestors = data['ancestorIds'];
  const ids: string[] = [];
  if (ancestors === undefined) {
    ids.push(categoryId);
    return ids;
  }
  if (!Array.isArray(ancestors)) {
    throw new HttpsError('failed-precondition', 'That category no longer exists. Reload the page.');
  }
  for (const ancestor of ancestors) {
    if (typeof ancestor !== 'string' || ancestor.length === 0) {
      throw new HttpsError('failed-precondition', 'That category no longer exists. Reload the page.');
    }
    ids.push(ancestor);
  }
  ids.push(categoryId);
  if (ids.length > 10) {
    throw new HttpsError('failed-precondition', 'That category no longer exists. Reload the page.');
  }
  return ids;
}

function changedLocks(
  live: DocumentData,
  input: ProductFormInput,
  categoryIds: readonly string[],
): LockableField[] {
  const locks: LockableField[] = [];
  if (live['type'] !== input.type) locks.push('type');
  if (live['brandId'] !== input.brandId) locks.push('brandId');
  const liveGroup = typeof live['modelGroup'] === 'string' ? live['modelGroup'] : null;
  if (liveGroup !== input.modelGroup) locks.push('modelGroup');
  if (live['published'] !== input.published) locks.push('published');
  if (!sameList(stringList(live['categoryIds']), categoryIds)) locks.push('categoryIds');
  if (!sameList(stringList(live['colors']), input.colors)) locks.push('colors');
  if (!sameList(stringList(live['tags']), input.tags)) locks.push('tags');
  return locks;
}

function applySizeAndStock(
  live: DocumentData,
  input: ProductFormInput,
  patch: DocumentData,
): void {
  const liveIds = readSizeValueIds(live['options']);
  const { options, sizeIds, newIds } = nextSizeOption(live['options'], input.sizes);
  patch['options'] = options;
  const unchanged =
    newIds.length === 0 &&
    liveIds.length === sizeIds.length &&
    liveIds.every((id, index) => id === sizeIds[index]);
  if (unchanged) return;

  if (liveIds.length > 0 && sizeIds.length > 0) {
    const liveMap = live['stockBySize'];
    if (!isPlainObject(liveMap)) {
      throw new HttpsError(
        'failed-precondition',
        'Set stock per size in the Stock dialog first, then change the sizes.',
      );
    }
    writeSizedStock(
      patch,
      Object.fromEntries(
        sizeIds.map((id, index) => [
          id,
          newIds.includes(id) ? (input.sizes[index]?.initialStock ?? 0) : liveCount(liveMap[id]),
        ]),
      ),
    );
    return;
  }

  if (liveIds.length === 0 && sizeIds.length > 0) {
    writeSizedStock(
      patch,
      Object.fromEntries(
        sizeIds.map((id, index) => [id, input.sizes[index]?.initialStock ?? 0]),
      ),
    );
    return;
  }

  if (sizeIds.length === 0 && liveIds.length > 0) {
    if (input.stock === undefined) {
      throw new HttpsError('invalid-argument', 'Enter one stock number for this product.');
    }
    const next = stockFields(null, input.stock);
    patch['stock'] = next.stock;
    patch['inStock'] = next.inStock;
    patch['stockBySize'] = FieldValue.delete();
  }
}

function writeSizedStock(patch: DocumentData, stockBySize: Record<string, number>): void {
  const next = stockFields(stockBySize);
  patch['stock'] = next.stock;
  patch['inStock'] = next.inStock;
  patch['stockBySize'] = next.stockBySize;
}

function assertPricePair(price: number, compareAtPrice: number | null): void {
  if (compareAtPrice !== null && compareAtPrice <= price) {
    throw new HttpsError(
      'invalid-argument',
      'The original price must be higher than the selling price.',
    );
  }
}

function liveCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function timestampMillis(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('toMillis' in value)) return null;
  const toMillis = (value as { toMillis?: unknown }).toMillis;
  if (typeof toMillis !== 'function') return null;
  const ms = toMillis.call(value);
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
