import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { CATALOG_BRAND_IDS, CATALOG_CATEGORY_IDS, CATALOG_TYPE_IDS } from './catalog-mapping.js';

export async function writeCatalogSummary(db: Firestore): Promise<void> {
  const [categories, types, brands, total] = await Promise.all([
    countByField(db, 'category', CATALOG_CATEGORY_IDS),
    countByField(db, 'type', CATALOG_TYPE_IDS),
    countByField(db, 'brand', CATALOG_BRAND_IDS),
    countPublished(db),
  ]);

  await db.doc('settings/catalog').set({
    categories,
    types,
    brands,
    total,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function countByField(
  db: Firestore,
  field: 'category' | 'type' | 'brand',
  ids: readonly string[],
): Promise<Record<string, number>> {
  const entries = await Promise.all(ids.map(async (id) => [id, await countEqual(db, field, id)] as const));
  return Object.fromEntries(entries);
}

async function countEqual(
  db: Firestore,
  field: 'category' | 'type' | 'brand',
  id: string,
): Promise<number> {
  const snap = await db
    .collection('products')
    .where('published', '==', true)
    .where(field, '==', id)
    .count()
    .get();
  return snap.data().count;
}

async function countPublished(db: Firestore): Promise<number> {
  const snap = await db.collection('products').where('published', '==', true).count().get();
  return snap.data().count;
}
