import {
  categoryIdsFor,
  COLOR_PALETTE,
  DEFAULT_CATEGORY_FOR_TYPE,
  SEED_BRANDS,
  SEED_CATEGORIES,
} from '@core/services/products/catalog-taxonomy';
import { PRODUCT_BRANDS, PRODUCT_TYPES } from '@core/services/products/product.constants';
import type { Brand, Category, Product, ProductTypeId } from '@core/services/products/product.model';
import { normalizeImageKitPath } from '@shared/utils/image';
import type {
  BrandOptionView,
  CategoryOptionView,
  ProductStockStatus,
  ProductTableRow,
} from '../models/product-admin.model';

const COLOR_LABELS = new Map<string, string>(COLOR_PALETTE.map((color) => [color.id, color.label]));
const TYPE_LABELS = new Map(PRODUCT_TYPES.map((type) => [type.id, type.label]));
const SEED_BRAND_LABELS = new Map<string, string>([
  ...PRODUCT_BRANDS.map((brand) => [brand.id, brand.label] as const),
  ...SEED_BRANDS.map((brand) => [brand.id, brand.name] as const),
]);
const SEED_CATEGORY_LABELS = new Map<string, string>(
  SEED_CATEGORIES.map((category) => [category.id, category.name]),
);

export function defaultCategoryForType(type: ProductTypeId): string {
  return DEFAULT_CATEGORY_FOR_TYPE[type] ?? 'accessories';
}

export function typeLabel(id: string): string {
  return TYPE_LABELS.get(id as ProductTypeId) ?? id;
}

export function brandLabel(id: string, brands?: ReadonlyMap<string, string>): string {
  return brands?.get(id) ?? SEED_BRAND_LABELS.get(id) ?? id;
}

export function categoryLabel(id: string, categories?: ReadonlyMap<string, string>): string {
  return categories?.get(id) ?? SEED_CATEGORY_LABELS.get(id) ?? id;
}

export function buildLeafCategoryOptions(categories: readonly Category[]): readonly CategoryOptionView[] {
  const source = categories.length > 0 ? categories : SEED_CATEGORIES;
  const parentIds = new Set(source.flatMap((cat) => (cat.parentId ? [cat.parentId] : [])));
  const byId = new Map(source.map((cat) => [cat.id, cat]));
  const leaves = source.filter((cat) => cat.depth === 1 || !parentIds.has(cat.id));

  return leaves.map((leaf) => {
    const parent = leaf.parentId ? byId.get(leaf.parentId) : undefined;
    const branch = leaf.parentId ? [leaf.parentId, leaf.id] : categoryIdsFor(leaf.id);
    return {
      id: leaf.id,
      // Hidden categories are listed too, so staff can fill one before showing it.
      label: leaf.published ? leaf.name : `${leaf.name} (hidden)`,
      group: parent ? `${parent.name}${parent.published ? '' : ' (hidden)'}` : '',
      categoryIds: branch,
    };
  });
}

export function buildBrandOptions(brands: readonly Brand[]): readonly BrandOptionView[] {
  if (brands.length > 0) {
    return brands.map((brand) => ({
      id: brand.id,
      label: brand.published ? brand.name : `${brand.name} (hidden)`,
    }));
  }
  return SEED_BRANDS.map((brand) => ({ id: brand.id, label: brand.name }));
}

export function toProductTableRow(
  product: Product,
  categoryNames?: ReadonlyMap<string, string>,
  brandNames?: ReadonlyMap<string, string>,
): ProductTableRow {
  const path = product.images[0]?.path;
  return {
    id: product.id,
    name: product.name,
    categoryId: product.categoryId,
    categoryLabel: categoryLabel(product.categoryId, categoryNames),
    type: product.type,
    typeLabel: typeLabel(product.type),
    brandId: product.brandId,
    brandLabel: brandLabel(product.brandId, brandNames),
    modelGroup: product.modelGroup ?? '',
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    published: product.published,
    imagePath: path ? normalizeImageKitPath(path) : null,
    status: product.published ? 'live' : 'hidden',
    stock: typeof product.stock === 'number' ? product.stock : null,
    stockStatus: stockStatusFor(product.stock),
    colourLabel: product.colors.map((id) => COLOR_LABELS.get(id) ?? id).join(' / '),
  };
}

/** At or below this many pieces the list marks a product as low on stock. */
export const LOW_STOCK_LIMIT = 5;

export function stockStatusFor(stock: number | null | undefined): ProductStockStatus {
  if (typeof stock !== 'number') return 'unset';
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_LIMIT ? 'low' : 'in';
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
    if (brandId !== 'all' && row.brandId !== brandId) return false;
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      row.brandLabel.toLowerCase().includes(needle) ||
      row.modelGroup.toLowerCase().includes(needle) ||
      row.categoryLabel.toLowerCase().includes(needle)
    );
  });
}

export function existingModelGroups(products: readonly Product[]): string[] {
  const groups = new Set<string>();
  for (const product of products) {
    if (product.modelGroup) groups.add(product.modelGroup);
  }
  return [...groups].sort((left, right) => left.localeCompare(right));
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
