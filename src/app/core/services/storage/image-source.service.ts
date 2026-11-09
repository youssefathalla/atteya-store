import { inject, Service, signal } from '@angular/core';
import {
  buildImageKitUrl,
  hasAllowedImageExtension,
  IMAGE_LIMITS,
  ImageFolderPath,
  ImageInputIssue,
  parseImageInput,
} from '@shared/utils/image';
import { StorageUploadService } from './storage-upload.service';

export type ImageErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_AN_IMAGE'
  | 'TOO_LARGE'
  | 'BLOCKED_BY_HOST'
  | 'NOT_FOUND'
  | 'NOT_REACHABLE_VIA_CDN'
  | 'UPLOAD_FAILED'
  | 'NOT_ALLOWED';

export class ImageInputError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = 'ImageInputError';
    this.code = code;
  }
}

export interface ResolvedImage {
  readonly path: string;
  readonly width?: number;
  readonly height?: number;
  readonly wasUploaded: boolean;
  readonly cdnDelayed?: boolean;
}

interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

function mapInputIssueToError(issue: ImageInputIssue): ImageInputError {
  switch (issue) {
    case 'empty':
      return new ImageInputError('INVALID_INPUT', 'Please enter an image link or file path.');
    case 'unsupported-protocol':
      return new ImageInputError('INVALID_INPUT', 'Only https:// image links are supported.');
    case 'malformed-url':
      return new ImageInputError(
        'INVALID_INPUT',
        'That web link does not look right. Please paste a complete image URL.',
      );
    case 'not-an-image-file':
      return new ImageInputError(
        'NOT_AN_IMAGE',
        'Please provide a supported image file (JPG, PNG, WebP, or AVIF). SVG files are not supported.',
      );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isInFolder(path: string, folder: ImageFolderPath): boolean {
  return path.startsWith(`${folder}/`);
}

const NOT_ALLOWED_MESSAGE =
  "You don't have permission to add images. Sign in with an admin account and try again.";

function isNotAllowed(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const code = (err as { code?: unknown }).code;
  return (
    code === 'storage/unauthorized' || code === 'functions/permission-denied' || code === 'permission-denied'
  );
}

@Service()
export class ImageSourceService {
  readonly #storageUpload = inject(StorageUploadService);
  readonly #isBusy = signal(false);

  readonly isBusy = this.#isBusy.asReadonly();
  readonly isUploading = this.#storageUpload.isUploading;

  /**
   * Validates a local `File`, reads its natural dimensions, uploads it to Firebase Storage,
   * and verifies CDN delivery through ImageKit.
   */
  async uploadFile(file: File, folder: ImageFolderPath): Promise<ResolvedImage> {
    this.#validateFile(file);
    this.#isBusy.set(true);

    try {
      const localDims = await this.#readFileDimensions(file);
      const { path } = await this.#storageUpload.uploadImage(file, folder);
      const probeDims = await this.#probeImageKitWithRetries(path, 3);
      const size = localDims ?? (probeDims ? await this.#readNaturalSize(path) : null);

      return {
        path,
        width: size?.width,
        height: size?.height,
        wasUploaded: true,
        cdnDelayed: probeDims === null,
      };
    } catch (err: unknown) {
      if (err instanceof ImageInputError) throw err;
      if (isNotAllowed(err)) throw new ImageInputError('NOT_ALLOWED', NOT_ALLOWED_MESSAGE);
      throw new ImageInputError(
        'UPLOAD_FAILED',
        'Unable to upload the image right now. Please check your connection and try again.',
      );
    } finally {
      this.#isBusy.set(false);
    }
  }

  /**
   * Resolves a user-typed or pasted string (relative path, ImageKit URL, Storage URL, or web URL).
   * - A managed path already in this folder is kept. One from another folder is copied.
   * - External URLs are imported via the `importImageFromUrl` Cloud Function (CORS-free).
   */
  async resolveInput(raw: string, folder: ImageFolderPath): Promise<ResolvedImage> {
    const parsed = parseImageInput(raw);
    if (parsed.kind === 'invalid') {
      throw mapInputIssueToError(parsed.issue);
    }

    this.#isBusy.set(true);
    try {
      if (parsed.kind === 'managed-path') {
        if (isInFolder(parsed.path, folder)) {
          const reachable = await this.#probeImageKitWithRetries(parsed.path, 2);
          if (!reachable) {
            throw new ImageInputError(
              'NOT_FOUND',
              "We couldn't find an image at that location. Please check the file path and try again.",
            );
          }
          const size = await this.#readNaturalSize(parsed.path);
          return {
            path: parsed.path,
            width: size?.width,
            height: size?.height,
            wasUploaded: false,
          };
        }
        const { path } = await this.#copyStoredImage(parsed.path, folder);
        return this.#resolvedUpload(path);
      }

      const { path } = await this.#importExternalUrl(parsed.url, folder);
      return this.#resolvedUpload(path);
    } finally {
      this.#isBusy.set(false);
    }
  }

  #validateFile(file: File): void {
    const allowedMime = IMAGE_LIMITS.allowedMime as readonly string[];
    const mimeOk = allowedMime.includes(file.type.toLowerCase());
    const extOk = hasAllowedImageExtension(file.name);

    if (!mimeOk || !extOk) {
      throw new ImageInputError(
        'NOT_AN_IMAGE',
        'Please choose a supported image file (JPG, PNG, WebP, or AVIF). SVG files are not supported.',
      );
    }

    if (file.size > IMAGE_LIMITS.maxBytes) {
      throw new ImageInputError('TOO_LARGE', 'This image is larger than 10MB. Please choose a smaller file.');
    }
  }

  async #importExternalUrl(url: string, folder: ImageFolderPath): Promise<{ path: string }> {
    try {
      return await this.#storageUpload.importFromUrl(url, folder);
    } catch (err: unknown) {
      this.#mapImportError(err);
    }
  }

  async #copyStoredImage(path: string, folder: ImageFolderPath): Promise<{ path: string }> {
    try {
      return await this.#storageUpload.copyStoredImage(path, folder);
    } catch (err: unknown) {
      this.#mapImportError(err);
    }
  }

  #mapImportError(err: unknown): never {
    if (isNotAllowed(err)) throw new ImageInputError('NOT_ALLOWED', NOT_ALLOWED_MESSAGE);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes("couldn't find an image")) {
      throw new ImageInputError(
        'NOT_FOUND',
        "We couldn't find an image at that location. Please check the file path and try again.",
      );
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('refused')) {
      throw new ImageInputError(
        'BLOCKED_BY_HOST',
        "That website doesn't allow copying its images directly. Please save the image to your device and use Upload Image.",
      );
    }
    if (msg.includes('10MB')) {
      throw new ImageInputError(
        'TOO_LARGE',
        'That image is larger than the 10MB limit. Please choose a smaller image.',
      );
    }
    if (msg.includes('supported image')) {
      throw new ImageInputError(
        'NOT_AN_IMAGE',
        'That link does not point to a supported image file (JPG, PNG, WebP, or AVIF).',
      );
    }
    throw new ImageInputError(
      'UPLOAD_FAILED',
      msg || 'Unable to import the image from that web link. Please verify the link and try again.',
    );
  }

  async #resolvedUpload(path: string): Promise<ResolvedImage> {
    const reachable = await this.#probeImageKitWithRetries(path, 3);
    const size = reachable ? await this.#readNaturalSize(path) : null;
    return {
      path,
      width: size?.width,
      height: size?.height,
      wasUploaded: true,
      cdnDelayed: reachable === null,
    };
  }

  #readNaturalSize(path: string): Promise<ImageDimensions | null> {
    return this.#probeImageElement(buildImageKitUrl(path));
  }

  /** Only checks that the photo is reachable. Don't store this size. */
  async #probeImageKitWithRetries(path: string, attempts: number): Promise<ImageDimensions | null> {
    const probeUrl = buildImageKitUrl(path, { w: 64, q: 60 });
    for (let i = 0; i < attempts; i++) {
      const dims = await this.#probeImageElement(probeUrl);
      if (dims) return dims;
      if (i < attempts - 1) {
        await delay(550);
      }
    }
    return null;
  }

  /**
   * Uses `new Image()` without `crossOrigin` so browser CORS preflights are never triggered,
   * while capturing `naturalWidth` and `naturalHeight`.
   */
  #probeImageElement(url: string): Promise<ImageDimensions | null> {
    if (typeof Image === 'undefined') {
      return Promise.resolve({ width: 1, height: 1 });
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          width: img.naturalWidth || 1,
          height: img.naturalHeight || 1,
        });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  #readFileDimensions(file: File): Promise<ImageDimensions | null> {
    if (typeof URL === 'undefined' || typeof Image === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const dims = {
          width: img.naturalWidth || 1,
          height: img.naturalHeight || 1,
        };
        URL.revokeObjectURL(objectUrl);
        resolve(dims);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
  }
}
