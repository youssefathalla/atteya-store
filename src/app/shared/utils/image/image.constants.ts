/**
 * Shared image limits, supported MIME types, extensions, and managed Storage folders.
 */

export const IMAGE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.avif'],
  maxAltLength: 125,
  maxGallerySize: 8,
} as const;

export const IMAGE_FOLDERS = ['hero', 'products', 'brands', 'categories'] as const;

export type ImageFolderRoot = (typeof IMAGE_FOLDERS)[number];

/**
 * Allows root folders ('hero', 'products') or entity subfolders ('products/<productId>').
 */
export type ImageFolderPath = ImageFolderRoot | `${ImageFolderRoot}/${string}`;

export const PROTECTED_STORAGE_PATHS = ['hero/default-hero.jpg'] as const;
