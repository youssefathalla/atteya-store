/**
 * Pure rules for `moveProductsToCategory` (ATS-266): the bulk Move to Category on the admin
 * Products list. Kept free of Firebase imports so `move-products.test.ts` can run them.
 */

/** Most products one Move to Category may change. */
export const MAX_MOVE_PRODUCTS = 200;

export interface MoveProductsRequest {
  readonly productIds: readonly string[];
  readonly categoryId: string;
}

function safeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !value.includes('/') &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value)
  );
}

/** The parsed request (ids de-duplicated, in the order sent), or the message for staff. */
export function readMoveProductsRequest(raw: unknown): MoveProductsRequest | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'Choose the products to move and try again.';
  }
  const data = raw as Record<string, unknown>;
  const categoryId = data['categoryId'];
  if (!safeId(categoryId)) return 'Choose a category.';
  const ids = data['productIds'];
  if (!Array.isArray(ids) || ids.length === 0) return 'Choose the products to move and try again.';
  if (ids.length > MAX_MOVE_PRODUCTS) {
    return `Move at most ${MAX_MOVE_PRODUCTS} products at a time.`;
  }
  const productIds: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!safeId(id)) return 'Choose the products to move and try again.';
    if (seen.has(id)) continue;
    seen.add(id);
    productIds.push(id);
  }
  return { productIds, categoryId };
}

/**
 * `categoryIds` for a product moved into this category: its ancestors (top first), then the
 * category itself, the same shape the product editor saves (`categoryIdsFrom()`). Null when the category doc is
 * malformed, so the move is refused instead of filing products under a broken path.
 */
export function movedCategoryIds(category: Record<string, unknown>, categoryId: string): string[] | null {
  const ancestors = category['ancestorIds'];
  // Same rule as the product editor's save (`categoryIdsFrom()` in product-form.fn.ts).
  if (ancestors === undefined) return [categoryId];
  if (!Array.isArray(ancestors)) return null;
  const ids: string[] = [];
  for (const ancestor of ancestors) {
    if (typeof ancestor !== 'string' || ancestor.length === 0 || ancestor === categoryId) return null;
    if (!ids.includes(ancestor)) ids.push(ancestor);
  }
  ids.push(categoryId);
  return ids.length > 10 ? null : ids;
}

/** True when a product already sits exactly in that place, so the move skips its write. */
export function alreadyInCategory(
  product: Record<string, unknown>,
  categoryId: string,
  categoryIds: readonly string[],
): boolean {
  const current = product['categoryIds'];
  return (
    product['categoryId'] === categoryId &&
    Array.isArray(current) &&
    current.length === categoryIds.length &&
    current.every((id, index) => id === categoryIds[index])
  );
}
