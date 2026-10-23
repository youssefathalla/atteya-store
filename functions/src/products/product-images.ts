import { getStorage } from 'firebase-admin/storage';
import { assertSafeUrl, fetchImage, ImageFetchError } from '../images/safe-image-fetch.js';
import { imageObjectPath, type MappedImageRef } from './product-mapper.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface StoredImage {
  readonly path: string;
  readonly alt: string;
  readonly sourceUrl: string;
}

export interface ImageCopyCounts {
  copied: number;
  skipped: number;
}

export function storedImage(docId: string, image: MappedImageRef): StoredImage {
  return {
    path: imageObjectPath(docId, image.sourceUrl),
    alt: image.alt,
    sourceUrl: image.sourceUrl,
  };
}

/**
 * Copies one EasyOrders photo into Storage when it is not already there.
 * The path is a pure function of the source URL, so a later run can skip the download.
 */
export async function copyProductImage(
  docId: string,
  image: MappedImageRef,
): Promise<{ image: StoredImage; copied: boolean }> {
  const stored = storedImage(docId, image);
  const file = getStorage().bucket().file(stored.path);
  const [exists] = await file.exists();
  if (exists) return { image: stored, copied: false };

  const fetched = await fetchImage(assertSafeUrl(image.sourceUrl), {
    maxBytes: MAX_IMAGE_BYTES,
    allowedTypes: ALLOWED_TYPES,
  });
  await file.save(fetched.buffer, {
    resumable: false,
    metadata: {
      contentType: fetched.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });
  return { image: stored, copied: true };
}

export function imageWarning(error: unknown): string {
  if (error instanceof ImageFetchError) return 'A photo could not be copied, so it was left out.';
  return 'A photo could not be saved, so it was left out.';
}
