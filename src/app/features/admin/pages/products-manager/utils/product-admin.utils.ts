import {
  categoryIdsFor,
  COLOR_PALETTE,
  DEFAULT_CATEGORY_FOR_TYPE,
  SEED_BRANDS,
  SEED_CATEGORIES,
} from '@core/services/products/catalog-taxonomy';
import { PRODUCT_TYPES } from '@core/services/products/product.constants';
import type { Brand, Category, Product, ProductTypeId } from '@core/services/products/product.model';
import { normalizeImageKitPath } from '@shared/utils/image';
import type {
  BrandOptionView,
  CategoryFilterOptionView,
  CategoryOptionView,
  ProductStockStatus,
  ProductTableRow,
} from '../models/product-admin.model';

const COLOR_LABELS = new Map<string, string>(COLOR_PALETTE.map((color) => [color.id, color.label]));
const TYPE_LABELS = new Map(PRODUCT_TYPES.map((type) => [type.id, type.label]));
/** Fallback only: rows pass the live brand names from Categories & Brands. */
const SEED_BRAND_LABELS = new Map<string, string>(SEED_BRANDS.map((brand) => [brand.id, brand.name]));
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

type CategoryNode = Pick<Category, 'id' | 'name' | 'parentId' | 'sortOrder' | 'published'>;

/**
 * The product editor's Category picker: one tree, each category once. Every main category in its
 * Categories & Brands order (level 0), each followed by the ones inside it (level 1); a category
 * whose main category is gone comes last. Every category is pickable, main ones too: products can
 * sit directly in a main category (all rackets are in `rackets`), and adding a category inside it
 * must not leave those products with an empty Category box. Hidden ones are listed and marked, so
 * staff can fill one before showing it. `path` is what the closed box shows ("Apparel › Shorts").
 */
export function buildLeafCategoryOptions(categories: readonly CategoryNode[]): readonly CategoryOptionView[] {
  const source: readonly CategoryNode[] = categories.length > 0 ? categories : SEED_CATEGORIES;
  const bySort = (left: CategoryNode, right: CategoryNode): number =>
    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
  const mark = (category: CategoryNode): string =>
    category.published ? category.name : `${category.name} (hidden)`;
  const ids = new Set(source.map((item) => item.id));
  const options: CategoryOptionView[] = [];
  for (const root of source.filter((item) => !item.parentId).sort(bySort)) {
    options.push({
      id: root.id,
      label: mark(root),
      path: mark(root),
      level: 0,
      categoryIds: categoryIdsFor(root.id),
    });
    for (const child of source.filter((item) => item.parentId === root.id).sort(bySort)) {
      options.push({
        id: child.id,
        label: mark(child),
        path: `${root.name} › ${mark(child)}`,
        level: 1,
        categoryIds: [root.id, child.id],
      });
    }
  }
  for (const orphan of source.filter((item) => item.parentId && !ids.has(item.parentId)).sort(bySort)) {
    options.push({
      id: orphan.id,
      label: mark(orphan),
      path: mark(orphan),
      level: 0,
      categoryIds: [orphan.parentId as string, orphan.id],
    });
  }
  return options;
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

/**
 * The Products Category filter (ATS-265): every main category in its order, each followed by the
 * ones inside it ("Apparel › Socks"); hidden ones are marked "(hidden)". A sub-category whose
 * parent is gone is listed on its own at the end.
 */
export function buildCategoryFilterOptions(
  categories: readonly Category[],
): readonly CategoryFilterOptionView[] {
  const bySort = (left: Category, right: Category): number =>
    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
  const ids = new Set(categories.map((item) => item.id));
  const mark = (category: Category, label: string): string =>
    category.published ? label : `${label} (hidden)`;
  const options: CategoryFilterOptionView[] = [];
  const roots = categories.filter((item) => !item.parentId).sort(bySort);
  for (const root of roots) {
    options.push({ id: root.id, label: mark(root, root.name) });
    for (const child of categories.filter((item) => item.parentId === root.id).sort(bySort)) {
      options.push({ id: child.id, label: mark(child, `${root.name} › ${child.name}`) });
    }
  }
  for (const orphan of categories.filter((item) => item.parentId && !ids.has(item.parentId)).sort(bySort)) {
    options.push({ id: orphan.id, label: mark(orphan, orphan.name) });
  }
  return options;
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
    categoryIds: product.categoryIds?.length ? product.categoryIds : [product.categoryId],
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
  categoryId = 'all',
): ProductTableRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (typeId !== 'all' && row.type !== typeId) return false;
    if (brandId !== 'all' && row.brandId !== brandId) return false;
    // A main category includes the ones inside it: products list their parents in categoryIds.
    if (categoryId !== 'all' && !row.categoryIds.includes(categoryId)) return false;
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

/** "Apparel › Hoodies" for a sub-category, the name for a main one, without the hidden mark (ATS-266). */
export function categoryPathLabel(categories: readonly Category[], id: string): string {
  const category = categories.find((item) => item.id === id);
  if (!category) return categoryLabel(id);
  const parent = category.parentId ? categories.find((item) => item.id === category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/** "5 products" / "1 product". */
export function productCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'product' : 'products'}`;
}

/**
 * Move to Category summary (ATS-266): "These 5 products will be in Apparel › Hoodies instead of
 * Apparel › T-shirts & polos." Several current categories read "instead of their current categories".
 */
export function moveSummary(count: number, targetLabel: string, currentLabels: readonly string[]): string {
  const subject = count === 1 ? 'This product' : `These ${count} products`;
  const distinct = [...new Set(currentLabels)];
  if (distinct.length === 1 && distinct[0] === targetLabel) {
    return `${count === 1 ? 'This product is' : `These ${count} products are`} already in ${targetLabel}.`;
  }
  const from =
    distinct.length === 1 ? distinct[0] : count === 1 ? 'its current category' : 'their current categories';
  return `${subject} will be in ${targetLabel} instead of ${from}.`;
}

/** Same cap as `MAX_MOVE_PRODUCTS` in functions/src/products/move-products.ts. */
export const MAX_MOVE_PRODUCTS = 200;

/** The snackbar after Move to Category: "Moved 5 products to Apparel › Hoodies." */
export function moveResultMessage(
  result: { readonly moved: number; readonly unchanged: number; readonly missing: number },
  targetLabel: string,
): string {
  const parts: string[] = [];
  if (result.moved > 0) parts.push(`Moved ${productCountLabel(result.moved)} to ${targetLabel}.`);
  if (result.unchanged > 0) {
    parts.push(
      `${productCountLabel(result.unchanged).replace(/^./, (c) => c.toUpperCase())} ${result.unchanged === 1 ? 'was' : 'were'} already there.`,
    );
  }
  if (result.missing > 0) {
    parts.push(`${productCountLabel(result.missing)} no longer existed.`);
  }
  return parts.join(' ') || `Nothing to move to ${targetLabel}.`;
}
