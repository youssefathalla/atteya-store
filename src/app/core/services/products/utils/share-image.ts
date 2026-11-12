import * as v from 'valibot';
import type { ShareImage } from './shop-categories';

/** The two fields of an `ImageAsset` a share preview needs (category photo, brand logo; ATS-263). */
export const ShareImageSchema = v.object({
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  alt: v.pipe(v.string(), v.trim(), v.maxLength(125)),
});

/** Only `path` and `alt` of a saved photo, so the TransferState seed stays small; null when there is none. */
export function toShareImage(
  image: { readonly path: string; readonly alt: string } | null | undefined,
): ShareImage | null {
  const path = image?.path?.trim();
  if (!path) return null;
  return { path, alt: image?.alt?.trim() ?? '' };
}
