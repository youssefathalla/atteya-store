---
name: image-delivery
description: "How storefront and admin images are stored and served in Atteya Store - Firebase Storage folders, the ImageKit proxy, dev and prod image hosts, NgOptimizedImage with appImageFallback, image URL helpers, uploads, galleries, alt text and importing images from a link. Read it before changing image display, uploads, galleries or the image functions."
---

# Image Delivery (ImageKit + Firebase Storage + Cloud Functions)

- **Proxy Architecture**: Master media files reside permanently in Firebase Cloud Storage. ImageKit acts as an external Web Folder origin (`https://storage.googleapis.com/<bucket>/`), intercepting requests to perform real-time resizing, WebP/AVIF compression, and global CDN delivery. That Google Cloud Storage URL is authorized by bucket IAM, not by `firebase/storage.rules`. Shop-category images are stored under `categories/` and follow the same path (`NgOptimizedImage` → ImageKit, then `buildStorageUrl()` on failure). The public single-object `get` in storage rules (all four image folders: `hero/`, `categories/`, `products/`, `brands/`) only covers Firebase SDK and `firebasestorage.googleapis.com` reads; storefront images do not depend on it. Folder listing stays admin-only. Photos from the one-time EasyOrders copy live under `products/<docId>/<sha1 of the source URL>.<ext>`. DigitalOcean serves some JPEGs as `Content-Type: image/jpg`; `canonicalContentType()` in `functions/src/images/safe-image-fetch.ts` treats that as `image/jpeg` before the type and magic-byte checks.
- **Environment Isolation**:
  - **Dev (`environment.ts`)**: `https://ik.imagekit.io/atteyastore/dev/` fetching from `atteya-store-dev.firebasestorage.app`.
  - **Prod (`environment.prod.ts`)**: `https://ik.imagekit.io/atteyastore/` fetching from `attiya-store.firebasestorage.app`.
  - Dev uploads, previews, and tests never collide with or affect production assets or cache.
- **Angular Image & Fallback Standards**:
  - Provided via `provideImageKitLoader(environment.imageKitUrl)` in `app.config.ts`.
  - **Strictly use `NgOptimizedImage` (`[ngSrc]`) paired with `AppImageFallbackDirective` (`[appImageFallback]`)** for all storefront and preview media. Raw `<img [src]>` for media assets is banned.
  - `[appImageFallback]` automatically renders a monochrome `.skeleton` shimmer while loading and fails over once to `buildStorageUrl()` if ImageKit CDN fails or is still syncing.
  - Never build Storage or ImageKit URLs by hand; always use `normalizeImageKitPath()`, `buildImageKitUrl()`, and `buildStorageUrl()` from `@shared/utils/image`.
- **Media Uploads, Galleries & Validation**:
  - Use `ImageAssetSchema` / `ImageGallerySchema` (`@shared/schemas`) with required SEO alt text (max 125 chars) and raster formats only (JPG, PNG, WebP, AVIF — SVG is banned).
  - Use `<app-image-picker>` (`@shared/ui/image-picker`) for single images and `<app-image-gallery-editor>` (`@shared/ui/image-gallery-editor`) for multi-image galleries (max 8 images, index 0 = Main image, pre-generated ID folder `products/<productId>`).
  - Use `ImageSourceService` (`@core/services/storage`) for validating uploads, probing ImageKit via CORS-safe `new Image()`, and importing external https links via the `importImageFromUrl` Callable Cloud Function (`functions/`). The browser does not fetch that URL itself.
  - Track uncommitted session uploads per draft using `StorageAssetTracker` (`@core/services/storage`).
