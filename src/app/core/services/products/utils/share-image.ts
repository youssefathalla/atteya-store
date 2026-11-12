import * as v from 'valibot';

/** The two fields of an `ImageAsset` a share preview needs (category photo, brand logo; ATS-263). */
export const ShareImageSchema = v.object({
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  alt: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(125)),
});

/** A photo for share previews: storage path plus its alt text. */
export type ShareImage = v.InferOutput<typeof ShareImageSchema>;

/** Only `path` and `alt` of a saved photo, so the TransferState seed stays small; null when there is none. */
export function toShareImage(
  image: { readonly path: string; readonly alt: string } | null | undefined,
): ShareImage | null {
  const path = image?.path?.trim();
  if (!path) return null;
  return { path, alt: image?.alt?.trim() ?? '' };
}

/**
 * The share picture of the shown category or brand whose slug or id is `slugOrId` (the same match
 * as `CatalogService.categoryBySlug()` / `brandBySlug()`); null when it is hidden, missing or has none.
 */
export function shareImageFor(
  items: readonly {
    readonly id: string;
    readonly slug: string;
    readonly published?: boolean;
    readonly image?: ShareImage;
  }[],
  slugOrId: string | null | undefined,
): ShareImage | null {
  const target = slugOrId?.trim().toLowerCase();
  if (!target) return null;
  const item = items.find(
    (entry) =>
      entry.published !== false && (entry.slug.toLowerCase() === target || entry.id.toLowerCase() === target),
  );
  return item?.image ?? null;
}

/** Same picture: lets a `computed()` keep its value when a live list sends a new copy. */
export function sameShareImage(a: ShareImage | null, b: ShareImage | null): boolean {
  return a === b || (!!a && !!b && a.path === b.path && a.alt === b.alt);
}
