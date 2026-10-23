import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { CATALOG_BRAND_IDS, CATALOG_TYPE_IDS } from './catalog-mapping.js';
import { SEED_BRANDS, SEED_CATEGORIES } from './catalog-taxonomy.js';

export interface RecountScope {
  readonly categoryIds?: readonly string[];
  readonly brandIds?: readonly string[];
  readonly types?: readonly string[];
}

export async function recountCatalog(db: Firestore, scope?: RecountScope): Promise<void> {
  const [categoryIds, brandIds] = await Promise.all([
    resolveCategoryIds(db, scope?.categoryIds),
    resolveBrandIds(db, scope?.brandIds),
  ]);
  const typeIds = scope?.types ? [...new Set(scope.types)] : [...CATALOG_TYPE_IDS];

  const [categoryCounts, brandCounts, typeCounts, total] = await Promise.all([
    countCategories(db, categoryIds),
    countEqualMap(db, 'brandId', brandIds),
    countEqualMap(db, 'type', typeIds),
    countPublished(db),
  ]);

  const partialScope = isPartialRecountScope(scope);

  await Promise.all([
    updateDocCounts(db, 'categories', categoryCounts),
    updateDocCounts(db, 'brands', brandCounts),
    writeCatalogSettings(db, {
      categoryCounts,
      brandCounts,
      typeCounts,
      total,
      partialScope,
    }),
  ]);
}

function isPartialRecountScope(scope?: RecountScope): boolean {
  if (!scope) return false;
  return (
    scope.categoryIds !== undefined ||
    scope.brandIds !== undefined ||
    scope.types !== undefined
  );
}

async function writeCatalogSettings(
  db: Firestore,
  payload: {
    readonly categoryCounts: Record<string, number>;
    readonly brandCounts: Record<string, number>;
    readonly typeCounts: Record<string, number>;
    readonly total: number;
    readonly partialScope: boolean;
  },
): Promise<void> {
  const { categoryCounts, brandCounts, typeCounts, total, partialScope } = payload;
  const updatedAt = FieldValue.serverTimestamp();
  const ref = db.doc('settings/catalog');

  if (!partialScope) {
    await ref.set(
      {
        categories: categoryCounts,
        brands: brandCounts,
        types: typeCounts,
        total,
        updatedAt,
      },
      { merge: true },
    );
    return;
  }

  await ref.set(
    {
      total,
      updatedAt,
      ...dotCountFields('categories', categoryCounts),
      ...dotCountFields('brands', brandCounts),
      ...dotCountFields('types', typeCounts),
    },
    { merge: true },
  );
}

function dotCountFields(
  prefix: 'categories' | 'brands' | 'types',
  counts: Readonly<Record<string, number>>,
): Record<string, number> {
  const fields: Record<string, number> = {};
  for (const [id, count] of Object.entries(counts)) {
    fields[`${prefix}.${id}`] = count;
  }
  return fields;
}

async function resolveCategoryIds(
  db: Firestore,
  scoped?: readonly string[],
): Promise<readonly string[]> {
  if (scoped) {
    return [...new Set(scoped.filter((id) => id.length > 0))];
  }
  const snap = await db.collection('categories').limit(200).get();
  const ids = new Set<string>(SEED_CATEGORIES.map((category) => category.id));
  for (const doc of snap.docs) ids.add(doc.id);
  return [...ids];
}

async function resolveBrandIds(
  db: Firestore,
  scoped?: readonly string[],
): Promise<readonly string[]> {
  if (scoped) {
    return [...new Set(scoped.filter((id) => id.length > 0))];
  }
  const snap = await db.collection('brands').limit(200).get();
  const ids = new Set<string>([...CATALOG_BRAND_IDS, ...SEED_BRANDS.map((brand) => brand.id)]);
  for (const doc of snap.docs) ids.add(doc.id);
  return [...ids];
}

async function countCategories(
  db: Firestore,
  ids: readonly string[],
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const snap = await db
        .collection('products')
        .where('published', '==', true)
        .where('categoryIds', 'array-contains', id)
        .count()
        .get();
      return [id, snap.data().count] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function countEqualMap(
  db: Firestore,
  field: 'brandId' | 'type',
  ids: readonly string[],
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const snap = await db
        .collection('products')
        .where('published', '==', true)
        .where(field, '==', id)
        .count()
        .get();
      return [id, snap.data().count] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function countPublished(db: Firestore): Promise<number> {
  const snap = await db.collection('products').where('published', '==', true).count().get();
  return snap.data().count;
}

async function updateDocCounts(
  db: Firestore,
  collectionName: 'categories' | 'brands',
  counts: Readonly<Record<string, number>>,
): Promise<void> {
  const entries = Object.entries(counts);
  if (entries.length === 0) return;
  const refs = entries.map(([id]) => db.doc(`${collectionName}/${id}`));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let writes = 0;

  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const [, nextCount] = entries[index];
    if (snap.get('productCount') === nextCount) return;
    batch.update(snap.ref, { productCount: nextCount });
    writes += 1;
  });

  if (writes > 0) await batch.commit();
}
