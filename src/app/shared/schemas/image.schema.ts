import * as v from 'valibot';
import { IMAGE_LIMITS } from '@shared/utils/image';

/**
 * Standard Valibot schema for a managed storefront/admin image asset.
 * Enforces non-empty storage path, required trimmed SEO alt text (max 125 chars),
 * and optional positive integer dimensions.
 */
export const ImageAssetSchema = v.object({
  path: v.pipe(v.string(), v.trim(), v.minLength(1, 'Image path is required')),
  alt: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Please describe the image for accessibility and SEO'),
    v.maxLength(
      IMAGE_LIMITS.maxAltLength,
      `Image description must be ${IMAGE_LIMITS.maxAltLength} characters or fewer`,
    ),
  ),
  width: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  height: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

export type ImageAsset = v.InferOutput<typeof ImageAssetSchema>;

/**
 * Product image gallery schema (1 to 8 images, index 0 = Main image).
 */
export const ImageGallerySchema = v.pipe(
  v.array(ImageAssetSchema),
  v.maxLength(
    IMAGE_LIMITS.maxGallerySize,
    `A gallery can contain up to ${IMAGE_LIMITS.maxGallerySize} images`,
  ),
);

export type ImageGallery = v.InferOutput<typeof ImageGallerySchema>;
