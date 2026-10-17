import { Service, signal } from '@angular/core';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { injectStorage } from '@core/firebase';
import { normalizeImageKitPath } from '@shared/utils/image.utils';

export interface UploadResult {
  /** Relative storage path within the bucket (e.g. 'hero/1729000000-banner.webp') */
  path: string;
  /** Full public download URL from Firebase */
  fullUrl: string;
}

@Service()
export class StorageUploadService {
  readonly #storage = injectStorage();

  readonly isUploading = signal(false);
  readonly uploadError = signal<string | null>(null);

  /**
   * Uploads an image file to Firebase Storage.
   *
   * @param file The image File to upload.
   * @param folder The bucket folder (defaults to 'hero').
   * @returns Promise resolving to the relative path and full download URL.
   */
  async uploadImage(file: File, folder = 'hero'): Promise<UploadResult> {
    this.isUploading.set(true);
    this.uploadError.set(null);

    try {
      // Clean filename and make unique with timestamp
      const sanitizedName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '-')
        .replace(/-+/g, '-');
      const uniquePath = `${folder}/${Date.now()}-${sanitizedName}`;

      const storageRef = ref(this.#storage, uniquePath);
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
      });

      const fullUrl = await getDownloadURL(snapshot.ref);

      return {
        path: uniquePath,
        fullUrl,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload image.';
      this.uploadError.set(message);
      throw err;
    } finally {
      this.isUploading.set(false);
    }
  }

  /**
   * Imports an external web image URL (e.g. Unsplash, Pexels) by fetching it
   * and saving it directly into Firebase Storage so the store permanently owns the asset.
   *
   * @param url External web URL of the image.
   * @param folder The bucket folder (defaults to 'hero').
   * @returns Promise resolving to the relative path and full download URL.
   */
  async importFromUrl(url: string, folder = 'hero'): Promise<UploadResult> {
    this.isUploading.set(true);
    this.uploadError.set(null);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download image from URL (HTTP ${response.status})`);
      }

      const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
      if (!contentType.startsWith('image/')) {
        throw new Error('The URL does not point to a valid image format.');
      }

      const blob = await response.blob();
      const maxSizeBytes = 10 * 1024 * 1024;
      if (blob.size > maxSizeBytes) {
        throw new Error('Downloaded image exceeds the maximum 10MB size limit.');
      }

      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/avif': 'avif',
      };
      const ext = mimeToExt[contentType] || 'jpg';
      const file = new File([blob], `imported-${Date.now()}.${ext}`, { type: contentType });

      // Delegate to uploadImage to upload the file to Firebase Storage
      return await this.uploadImage(file, folder);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to import image from URL.';
      this.uploadError.set(message);
      throw err;
    } finally {
      this.isUploading.set(false);
    }
  }

  /**
   * Deletes a specific file from Firebase Storage.
   * Silently ignores local public assets (/img/...) or external URLs.
   *
   * @param pathOrUrl Relative bucket path (e.g. 'hero/123.jpg') or full URL.
   * @returns Promise<boolean> indicating whether deletion succeeded.
   */
  async deleteImage(pathOrUrl: string): Promise<boolean> {
    if (!pathOrUrl) return false;

    const cleanPath = normalizeImageKitPath(pathOrUrl);
    // Safety guard: only delete files residing inside managed storage folders (e.g. 'hero/', 'products/')
    // Never attempt to delete external URLs, local public images (/img/), or the default hero fallback
    if (
      !cleanPath ||
      cleanPath.startsWith('http') ||
      cleanPath.startsWith('img/') ||
      cleanPath === 'hero/default-hero.jpg'
    ) {
      return false;
    }

    try {
      const storageRef = ref(this.#storage, cleanPath);
      await deleteObject(storageRef);
      return true;
    } catch (err: unknown) {
      // If the object already doesn't exist (e.g. storage/object-not-found), don't block the caller
      console.warn(`Could not delete storage asset at ${cleanPath}:`, err);
      return false;
    }
  }

  /**
   * Deletes multiple files from Firebase Storage in parallel.
   */
  async deleteImages(paths: readonly string[]): Promise<void> {
    if (!paths.length) return;
    await Promise.allSettled(paths.map((p) => this.deleteImage(p)));
  }
}

