import { Service, signal } from '@angular/core';
import { callableFrom, injectFunctionsAsync, injectStorageAsync } from '@core/firebase';
import { ImageFolderPath, normalizeImageKitPath, PROTECTED_STORAGE_PATHS } from '@shared/utils/image';

export interface UploadResult {
  /** Relative storage path within the bucket (e.g. 'hero/1729000000-banner.webp') */
  readonly path: string;
}

type CloudImportPayload =
  | { readonly url: string; readonly folder: ImageFolderPath }
  | { readonly path: string; readonly folder: ImageFolderPath };

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
  readonly #storage = injectStorageAsync();
  readonly #functions = injectFunctionsAsync();

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

      const { ref, uploadBytes } = await import('firebase/storage');
      const storageRef = ref(await this.#storage(), uniquePath);
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
   * Imports an external https image into Firebase Storage via the
   * `importImageFromUrl` callable. Server errors are rethrown so the caller
   * can show them. The browser never downloads the file itself.
   */
  async importFromUrl(url: string, folder: ImageFolderPath = 'hero'): Promise<UploadResult> {
    this.#isUploading.set(true);
    this.#uploadError.set(null);

    try {
      const callable = await callableFrom<CloudImportPayload, UploadResult>(
        this.#functions(),
        'importImageFromUrl',
      );
      const result = await callable({ url, folder });
      return { path: result.data.path };
    } catch (fnErr: unknown) {
      const message = fnErr instanceof Error ? fnErr.message : 'Unable to import image from that web link.';
      this.#uploadError.set(message);
      throw fnErr;
    } finally {
      this.#isUploading.set(false);
    }
  }

  /**
   * Copies one of our own stored images into `folder` via `importImageFromUrl`.
   * Server errors are rethrown. The browser never downloads the file itself.
   */
  async copyStoredImage(path: string, folder: ImageFolderPath): Promise<UploadResult> {
    this.#isUploading.set(true);
    this.#uploadError.set(null);

    try {
      const callable = await callableFrom<CloudImportPayload, UploadResult>(
        this.#functions(),
        'importImageFromUrl',
      );
      const result = await callable({ path, folder });
      return { path: result.data.path };
    } catch (fnErr: unknown) {
      const message = fnErr instanceof Error ? fnErr.message : 'Unable to copy that image.';
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
      const { ref, deleteObject } = await import('firebase/storage');
      const storageRef = ref(await this.#storage(), cleanPath);
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
}
