/** Browser session stash so a guest heart tap can be saved after sign-in. */

export interface PendingFavorite {
  readonly productId: string;
  readonly slug: string;
}

const PENDING_FAVORITE_KEY = 'atteya-pending-favorite';

export function stashPendingFavorite(productId: string, slug: string): void {
  const id = productId.trim();
  const productSlug = slug.trim();
  if (!id || !productSlug) return;
  try {
    sessionStorage.setItem(PENDING_FAVORITE_KEY, JSON.stringify({ productId: id, slug: productSlug }));
  } catch {
    // Private mode can block storage; sign-in still works without the auto-save.
  }
}

export function readPendingFavorite(): PendingFavorite | null {
  try {
    const raw = sessionStorage.getItem(PENDING_FAVORITE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const productId =
      'productId' in parsed && typeof parsed.productId === 'string' ? parsed.productId.trim() : '';
    const slug = 'slug' in parsed && typeof parsed.slug === 'string' ? parsed.slug.trim() : '';
    if (!productId || !slug) return null;
    return { productId, slug };
  } catch {
    return null;
  }
}

export function clearPendingFavorite(): void {
  try {
    sessionStorage.removeItem(PENDING_FAVORITE_KEY);
  } catch {
    // Ignore blocked storage.
  }
}
