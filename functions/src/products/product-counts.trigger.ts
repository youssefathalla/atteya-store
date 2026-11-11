import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { recountCatalog } from './catalog-counts.js';

export const onProductCountsChange = onDocumentWritten(
  { document: 'products/{productId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!countsFieldsChanged(before, after)) return;

    const categoryIds = new Set<string>([...readCategoryIds(before), ...readCategoryIds(after)]);
    const brandIds = new Set<string>();
    const beforeBrand = readBrandId(before);
    const afterBrand = readBrandId(after);
    if (beforeBrand) brandIds.add(beforeBrand);
    if (afterBrand) brandIds.add(afterBrand);

    const types = new Set<string>();
    const beforeType = readType(before);
    const afterType = readType(after);
    if (beforeType) types.add(beforeType);
    if (afterType) types.add(afterType);

    await recountCatalog(getFirestore(), {
      categoryIds: [...categoryIds],
      brandIds: [...brandIds],
      types: [...types],
    });
  },
);

function countsFieldsChanged(before: DocumentData | undefined, after: DocumentData | undefined): boolean {
  const beforePub = before?.['published'] === true;
  const afterPub = after?.['published'] === true;
  if (!beforePub && !afterPub) return false;
  if (beforePub !== afterPub) return true;
  if (readBrandId(before) !== readBrandId(after)) return true;
  if (readType(before) !== readType(after)) return true;

  const beforeCats = readCategoryIds(before);
  const afterCats = readCategoryIds(after);
  if (beforeCats.length !== afterCats.length) return true;
  return beforeCats.some((id, index) => id !== afterCats[index]);
}

function readCategoryIds(data: DocumentData | undefined): string[] {
  if (!data || !Array.isArray(data['categoryIds'])) return [];
  return data['categoryIds'].filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function readBrandId(data: DocumentData | undefined): string | null {
  if (!data) return null;
  if (typeof data['brandId'] === 'string' && data['brandId'].length > 0) return data['brandId'];
  if (typeof data['brand'] === 'string' && data['brand'].length > 0) return data['brand'];
  return null;
}

function readType(data: DocumentData | undefined): string | null {
  if (!data) return null;
  return typeof data['type'] === 'string' && data['type'].length > 0 ? data['type'] : null;
}
