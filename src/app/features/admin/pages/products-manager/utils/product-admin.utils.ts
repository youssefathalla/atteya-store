import {
  PRODUCT_BRANDS,
  PRODUCT_TYPES,
} from '@core/services/products/product.constants';
import type {
  BrandId,
  Product,
  ProductCategoryId,
  ProductTypeId,
} from '@core/services/products/product.model';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { ImportReport, ImportRowView, ProductTableRow } from '../models/product-admin.model';

const TYPE_LABELS = new Map(PRODUCT_TYPES.map((type) => [type.id, type.label]));
const BRAND_LABELS = new Map(PRODUCT_BRANDS.map((brand) => [brand.id, brand.label]));

export function categoryForProductType(type: ProductTypeId): ProductCategoryId {
  const match = PRODUCT_TYPES.find((item) => item.id === type);
  return match?.category ?? 'accessories';
}

export function typeLabel(id: string): string {
  return TYPE_LABELS.get(id as ProductTypeId) ?? id;
}

export function brandLabel(id: string): string {
  return BRAND_LABELS.get(id as BrandId) ?? id;
}

export function toProductTableRow(product: Product): ProductTableRow {
  const path = product.images[0]?.path;
  return {
    id: product.id,
    name: product.name,
    type: product.type,
    typeLabel: typeLabel(product.type),
    brand: product.brand,
    brandLabel: brandLabel(product.brand),
    modelGroup: product.modelGroup ?? '',
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    published: product.published,
    imagePath: path ? normalizeImageKitPath(path) : null,
    status: product.published ? 'live' : 'hidden',
  };
}

export function filterProductRows(
  rows: readonly ProductTableRow[],
  search: string,
  typeId: string,
  brandId: string,
): ProductTableRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (typeId !== 'all' && row.type !== typeId) return false;
    if (brandId !== 'all' && row.brand !== brandId) return false;
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle) || row.modelGroup.toLowerCase().includes(needle);
  });
}

export function existingModelGroups(products: readonly Product[]): string[] {
  const groups = new Set<string>();
  for (const product of products) {
    if (product.modelGroup) groups.add(product.modelGroup);
  }
  return [...groups].sort((left, right) => left.localeCompare(right));
}

export function importSummary(report: ImportReport): string {
  const counts = report.counts;
  if (report.dryRun) {
    return `Preview checked ${report.total} products. Nothing was saved.`;
  }
  return `Import finished. ${counts.created} new, ${counts.updated} updated, ${counts.unchanged} unchanged.`;
}

export function tallyRows(rows: readonly ImportRowView[], key: 'type' | 'brand'): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row[key];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const labelFor = key === 'type' ? typeLabel : brandLabel;
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: labelFor(id), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function modelGroupLines(rows: readonly ImportRowView[]): { id: string; members: string }[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.modelGroup) continue;
    const members = groups.get(row.modelGroup) ?? [];
    members.push(row.name);
    groups.set(row.modelGroup, members);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, members]) => ({ id, members: members.join(', ') }));
}

export function isModelGroup(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > 80) return false;
  return trimmed.split('-').every((part) => part.length > 0 && isSlugPart(part));
}

function isSlugPart(part: string): boolean {
  for (const char of part) {
    const code = char.charCodeAt(0);
    const digit = code >= 48 && code <= 57;
    const letter = code >= 97 && code <= 122;
    if (!digit && !letter) return false;
  }
  return true;
}
