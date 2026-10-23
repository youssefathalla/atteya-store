import type { Firestore } from 'firebase-admin/firestore';
import { SEED_BRANDS, SEED_CATEGORIES } from '../products/catalog-taxonomy.js';

export interface CachedCategoryInfo {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly ancestorIds: readonly string[];
  readonly depth: 0 | 1;
}

export interface CachedBrandInfo {
  readonly id: string;
  readonly name: string;
}

export interface CatalogLookupMaps {
  readonly categoriesById: ReadonlyMap<string, CachedCategoryInfo>;
  readonly brandsById: ReadonlyMap<string, CachedBrandInfo>;
}

const TTL_MS = 5 * 60 * 1000;
let cachedAt = 0;
let cachedLookup: CatalogLookupMaps | null = null;

export async function getCatalogLookup(
  db: Firestore,
  forceRefresh = false,
): Promise<CatalogLookupMaps> {
  const now = Date.now();
  if (!forceRefresh && cachedLookup && now - cachedAt < TTL_MS) {
    return cachedLookup;
  }

  const [catSnap, brandSnap] = await Promise.all([
    db.collection('categories').limit(200).get(),
    db.collection('brands').limit(200).get(),
  ]);

  const categoriesById = new Map<string, CachedCategoryInfo>(
    SEED_CATEGORIES.map((seed) => [
      seed.id,
      {
        id: seed.id,
        name: seed.name,
        parentId: seed.parentId,
        ancestorIds: seed.ancestorIds,
        depth: seed.depth,
      },
    ]),
  );

  for (const doc of catSnap.docs) {
    const data = doc.data();
    const name = typeof data['name'] === 'string' && data['name'].trim() ? data['name'].trim() : doc.id;
    const parentId = typeof data['parentId'] === 'string' ? data['parentId'] : null;
    const ancestorIds = Array.isArray(data['ancestorIds'])
      ? data['ancestorIds'].filter((id): id is string => typeof id === 'string')
      : [];
    const depth: 0 | 1 = data['depth'] === 1 ? 1 : 0;
    categoriesById.set(doc.id, { id: doc.id, name, parentId, ancestorIds, depth });
  }

  const brandsById = new Map<string, CachedBrandInfo>(
    SEED_BRANDS.map((seed) => [seed.id, { id: seed.id, name: seed.name }]),
  );

  for (const doc of brandSnap.docs) {
    const data = doc.data();
    const name = typeof data['name'] === 'string' && data['name'].trim() ? data['name'].trim() : doc.id;
    brandsById.set(doc.id, { id: doc.id, name });
  }

  cachedLookup = { categoriesById, brandsById };
  cachedAt = now;
  return cachedLookup;
}
