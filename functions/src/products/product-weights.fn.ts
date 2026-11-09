import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { defaultWeightGrams, readCategoryWeight, type CategoryWeightDefaults } from './catalog-taxonomy.js';

/**
 * Admin: shipping weights (Catalogue Tools → Shipping Weights).
 * - `preview`: each category's default weight and the products that have no weight.
 * - `saveDefaults`: save the default weight of the categories sent (`null` = no default).
 * - `fillEmpty`: give every product with no weight its default (category, then parent; any
 *   "jacket" by name = 800 g). A weight already set, by hand or earlier, is never replaced.
 * Every action returns the fresh report.
 */
export const productWeights = onCall(
  adminCallableOptions({ timeoutSeconds: 300 }),
  async (request): Promise<ProductWeightsReport> => {
    const actor = await requireRole(request, 'admin');
    const input = parseInput(request.data);
    const db = getFirestore();

    let filled = 0;
    if (input.action === 'saveDefaults') {
      await saveDefaults(db, input.weights, actor.uid);
    } else if (input.action === 'fillEmpty') {
      filled = await fillEmpty(db, actor.uid);
    }
    return { ...(await buildReport(db)), filled };
  },
);

export interface CategoryWeightRow {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  /** The default staff saved, or null. Undefined when nothing is saved yet. */
  readonly savedGrams: number | null | undefined;
  /**
   * What a product in this category gets now: its own default (saved, else built-in), then its
   * parents' — the same lookup Fill Empty Weights uses. Null for none.
   */
  readonly grams: number | null;
  /** Products in this category (leaf) that still have no weight. */
  readonly missing: number;
}

export interface MissingWeightRow {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  /** What Fill Empty Weights would give it, or null when there is no default. */
  readonly suggestedGrams: number | null;
}

export interface ProductWeightsReport {
  readonly categories: readonly CategoryWeightRow[];
  readonly missingTotal: number;
  /** First products without a weight, by name (at most `MAX_LISTED`). */
  readonly missing: readonly MissingWeightRow[];
  /** Products given a weight by this call (`fillEmpty` only). */
  readonly filled: number;
}

type Input =
  | { readonly action: 'preview' }
  | { readonly action: 'fillEmpty' }
  | { readonly action: 'saveDefaults'; readonly weights: CategoryWeightDefaults };

const MAX_GRAMS = 100_000;
const MAX_LISTED = 200;
/** The catalogue is about a hundred products; this is a safety cap, not a page size. */
const MAX_PRODUCTS = 5_000;

interface CategoryInfo {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  /** Parent categories, root first (`categories/{id}.ancestorIds`). */
  readonly ancestorIds: readonly string[];
  readonly saved: number | null | undefined;
}

interface ProductInfo {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryIds: readonly string[];
  readonly hasWeight: boolean;
}

async function loadCategories(db: Firestore): Promise<CategoryInfo[]> {
  const snap = await db.collection('categories').limit(500).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: typeof data['name'] === 'string' ? data['name'] : doc.id,
        path: typeof data['path'] === 'string' ? data['path'] : doc.id,
        ancestorIds: Array.isArray(data['ancestorIds'])
          ? data['ancestorIds'].filter((id): id is string => typeof id === 'string')
          : [],
        saved: readCategoryWeight(data['defaultWeightGrams']),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function loadProducts(db: Firestore): Promise<ProductInfo[]> {
  const snap = await db
    .collection('products')
    .select('name', 'categoryId', 'categoryIds', 'weightGrams')
    .limit(MAX_PRODUCTS)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    const categoryId = typeof data['categoryId'] === 'string' ? data['categoryId'] : '';
    const parents = Array.isArray(data['categoryIds']) ? data['categoryIds'].map(String) : [];
    return {
      id: doc.id,
      name: typeof data['name'] === 'string' ? data['name'] : doc.id,
      categoryId,
      // Leaf first, then its parents (the stored list also holds the leaf).
      categoryIds: [categoryId, ...parents.filter((id) => id !== categoryId)].filter(Boolean),
      hasWeight: typeof data['weightGrams'] === 'number',
    };
  });
}

function savedDefaults(categories: readonly CategoryInfo[]): CategoryWeightDefaults {
  const out: Record<string, number | null> = {};
  for (const category of categories) {
    if (category.saved !== undefined) out[category.id] = category.saved;
  }
  return out;
}

async function buildReport(db: Firestore): Promise<Omit<ProductWeightsReport, 'filled'>> {
  const [categories, products] = await Promise.all([loadCategories(db), loadProducts(db)]);
  const saved = savedDefaults(categories);
  const missingProducts = products.filter((product) => !product.hasWeight);
  const missingByCategory = new Map<string, number>();
  for (const product of missingProducts) {
    missingByCategory.set(product.categoryId, (missingByCategory.get(product.categoryId) ?? 0) + 1);
  }
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      path: category.path,
      savedGrams: category.saved,
      grams: defaultWeightGrams([category.id, ...category.ancestorIds], '', saved),
      missing: missingByCategory.get(category.id) ?? 0,
    })),
    missingTotal: missingProducts.length,
    missing: missingProducts
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_LISTED)
      .map((product) => ({
        id: product.id,
        name: product.name,
        categoryId: product.categoryId,
        suggestedGrams: defaultWeightGrams(product.categoryIds, product.name, saved),
      })),
  };
}

async function saveDefaults(db: Firestore, weights: CategoryWeightDefaults, uid: string): Promise<void> {
  const ids = Object.keys(weights);
  if (ids.length === 0) return;
  const refs = ids.map((id) => db.collection('categories').doc(id));
  const snaps = await db.getAll(...refs);
  const unknown = snaps.filter((snap) => !snap.exists);
  if (unknown.length > 0) {
    throw new HttpsError('not-found', 'One of these categories no longer exists. Reload and try again.');
  }
  const batch = db.batch();
  for (const ref of refs) {
    batch.update(ref, {
      defaultWeightGrams: weights[ref.id] ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.create(db.collection('auditLogs').doc(), {
    action: 'categories.defaultWeights',
    actorUid: uid,
    at: FieldValue.serverTimestamp(),
    weights,
  });
  await batch.commit();
}

async function fillEmpty(db: Firestore, uid: string): Promise<number> {
  const [categories, products] = await Promise.all([loadCategories(db), loadProducts(db)]);
  const saved = savedDefaults(categories);
  let filled = 0;
  // Firestore batches hold at most 500 writes.
  let batch = db.batch();
  let pending = 0;
  for (const product of products) {
    if (product.hasWeight) continue;
    const grams = defaultWeightGrams(product.categoryIds, product.name, saved);
    if (grams === null) continue;
    const ref = db.collection('products').doc(product.id);
    batch.update(ref, {
      weightGrams: grams,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
    filled += 1;
    pending += 1;
    if (pending === 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  return filled;
}

function parseInput(raw: unknown): Input {
  const data = isRecord(raw) ? raw : {};
  const action = data['action'];
  if (action === 'preview' || action === 'fillEmpty') return { action };
  if (action !== 'saveDefaults') {
    throw new HttpsError('invalid-argument', 'Choose what to do with shipping weights.');
  }
  const weights = data['weights'];
  if (!isRecord(weights) || Object.keys(weights).length > 200) {
    throw new HttpsError('invalid-argument', 'Send the category weights to save.');
  }
  const out: Record<string, number | null> = {};
  for (const [id, value] of Object.entries(weights)) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) {
      throw new HttpsError('invalid-argument', 'One of the categories could not be read.');
    }
    if (value === null) {
      out[id] = null;
    } else if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_GRAMS) {
      out[id] = value;
    } else {
      throw new HttpsError(
        'invalid-argument',
        'Weights must be whole grams from 0 to 100,000, or left empty.',
      );
    }
  }
  return { action: 'saveDefaults', weights: out };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
