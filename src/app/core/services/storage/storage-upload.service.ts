import { Service, signal } from '@angular/core';
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { injectFunctions, injectStorage } from '@core/firebase';
import {
  IMAGE_LIMITS,
  ImageFolderPath,
  normalizeImageKitPath,
  PROTECTED_STORAGE_PATHS,
} from '@shared/utils/image';

export interface UploadResult {
  /** Relative storage path within the bucket (e.g. 'hero/1729000000-banner.webp') */
  readonly path: string;
}

interface CloudImportPayload {
  readonly url: string;
  readonly folder: ImageFolderPath;
}

const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function sanitizeStorageFilename(name: string): string {
  let clean = name.toLowerCase().replace(/[^a-z0-9.]/g, '-');
  while (clean.includes('--')) {
    clean = clean.replace('--', '-');
  }
  while (clean.startsWith('-')) {
    clean = clean.slice(1);
  }
  while (clean.endsWith('-')) {
    clean = clean.slice(0, -1);
  }
  return clean || 'image.jpg';
}

@Service()
export class StorageUploadService {
  readonly #storage = injectStorage();
  readonly #functions = injectFunctions();

  readonly #isUploading = signal(false);
  readonly #uploadError = signal<string | null>(null);

  readonly isUploading = this.#isUploading.asReadonly();
  readonly uploadError = this.#uploadError.asReadonly();

  /**
   * Uploads an image file to Firebase Storage using `uploadBytes()`.
   * Does not call `getDownloadURL()`, avoiding Storage Rules read errors.
   */
  async uploadImage(file: File, folder: ImageFolderPath = 'hero'): Promise<UploadResult> {
    this.#isUploading.set(true);
    this.#uploadError.set(null);

    try {
      const sanitizedName = sanitizeStorageFilename(file.name);
      const uniquePath = `${folder}/${Date.now()}-${sanitizedName}`;

      const storageRef = ref(this.#storage, uniquePath);
      await uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      });

      return { path: uniquePath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to upload image.';
      this.#uploadError.set(message);
      throw err;
    } finally {
      this.#isUploading.set(false);
    }
  }

  /**
   * Imports an external web image URL into Firebase Storage via the
   * `importImageFromUrl` Callable Cloud Function (bypassing browser CORS).
   * Falls back to client-side fetch only if the Cloud Function is not yet deployed in dev.
   */
  async importFromUrl(url: string, folder: ImageFolderPath = 'hero'): Promise<UploadResult> {
    this.#isUploading.set(true);
    this.#uploadError.set(null);

    try {
      const callable = httpsCallable<CloudImportPayload, UploadResult>(
        this.#functions,
        'importImageFromUrl',
      );
      const result = await callable({ url, folder });
      return { path: result.data.path };
    } catch (fnErr: unknown) {
      if (this.#shouldFallbackToClientFetch(fnErr)) {
        return await this.#importFromUrlClientFallback(url, folder);
      }
      const message =
        fnErr instanceof Error ? fnErr.message : 'Unable to import image from that web link.';
      this.#uploadError.set(message);
      throw fnErr;
    } finally {
      this.#isUploading.set(false);
    }
  }

  /**
   * Deletes a specific file from Firebase Storage.
   * Silently ignores local public assets (`/img/...`), external URLs, or protected paths.
   */
  async deleteImage(pathOrUrl: string): Promise<boolean> {
    if (!pathOrUrl) return false;

    const cleanPath = normalizeImageKitPath(pathOrUrl);
    const isProtected = (PROTECTED_STORAGE_PATHS as readonly string[]).includes(cleanPath);
    if (
      !cleanPath ||
      cleanPath.startsWith('http://') ||
      cleanPath.startsWith('https://') ||
      cleanPath.startsWith('img/') ||
      isProtected
    ) {
      return false;
    }

    try {
      const storageRef = ref(this.#storage, cleanPath);
      await deleteObject(storageRef);
      return true;
    } catch (err: unknown) {
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

  #shouldFallbackToClientFetch(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const code = (err as { code?: string }).code ?? '';
    return (
      code === 'functions/not-found' ||
      code === 'functions/unimplemented' ||
      (code === 'functions/internal' && err.message.includes('Failed to fetch'))
    );
  }

  async #importFromUrlClientFallback(
    url: string,
    folder: ImageFolderPath,
  ): Promise<UploadResult> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to download image from link (HTTP ${response.status}).`);
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const ext = MIME_TO_EXT[contentType];
    if (!ext) {
      throw new Error('That link does not point to a supported image format (JPG, PNG, WebP, or AVIF).');
    }

    const blob = await response.blob();
    if (blob.size > IMAGE_LIMITS.maxBytes) {
      throw new Error('The image is larger than the 10MB limit.');
    }

    const file = new File([blob], `imported-${Date.now()}.${ext}`, { type: contentType });
    return await this.uploadImage(file, folder);
  }
}
