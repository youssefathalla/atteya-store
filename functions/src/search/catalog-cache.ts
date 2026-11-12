import type { Firestore } from 'firebase-admin/firestore';
import { SEED_BRANDS, SEED_CATEGORIES } from '../products/catalog-taxonomy.js';
import { PLAYERS_DOC_PATH, readPlayerList } from '../products/players.js';

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
  /** Player id -> display name, from `settings/players` (Shop's Player filter). */
  readonly playerNamesById: ReadonlyMap<string, string>;
}

const TTL_MS = 5 * 60 * 1000;
let cachedAt = 0;
let cachedLookup: CatalogLookupMaps | null = null;
let cachedNamesStamp = 0;

/**
 * `settings/catalog` field the Categories & Brands callables stamp (ms) after a category or
 * brand is added, renamed or deleted. A cached lookup built before a different stamp is read
 * again, so no function instance keeps sending an old name to search.
 */
export const NAMES_CHANGED_FIELD = 'namesChangedAtMs';

async function readNamesStamp(db: Firestore): Promise<number> {
  try {
    const value = (await db.doc('settings/catalog').get()).get(NAMES_CHANGED_FIELD);
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

export async function getCatalogLookup(db: Firestore, forceRefresh = false): Promise<CatalogLookupMaps> {
  const now = Date.now();
  if (!forceRefresh && cachedLookup && now - cachedAt < TTL_MS) {
    if ((await readNamesStamp(db)) === cachedNamesStamp) return cachedLookup;
  }

  const [catSnap, brandSnap, playersSnap, namesStamp] = await Promise.all([
    db.collection('categories').limit(200).get(),
    db.collection('brands').limit(200).get(),
    db.doc(PLAYERS_DOC_PATH).get(),
    readNamesStamp(db),
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

  const playerNamesById = new Map<string, string>(
    readPlayerList(playersSnap.data()).map((player) => [player.id, player.name]),
  );

  cachedLookup = { categoriesById, brandsById, playerNamesById };
  cachedAt = now;
  cachedNamesStamp = namesStamp;
  return cachedLookup;
}
