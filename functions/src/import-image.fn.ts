import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from './auth/callable-options.js';
import { requireRole } from './auth/require-role.js';
import { assertSafeUrl, fetchImage, ImageFetchError, type FetchedImage } from './images/safe-image-fetch.js';

const ALLOWED_FOLDERS = new Set(['hero', 'products', 'brands', 'categories']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

interface ImportImageRequest {
  readonly url?: unknown;
  readonly folder?: unknown;
}

interface ImportImageResponse {
  readonly path: string;
}

function sanitizeFolder(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new HttpsError('invalid-argument', 'A valid storage folder is required.');
  }
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '');
  const parts = trimmed.split('/');
  const root = parts[0] ?? '';
  if (!ALLOWED_FOLDERS.has(root) || parts.length > 2) {
    throw new HttpsError('invalid-argument', 'Unsupported destination folder.');
  }
  if (parts.length === 2 && !/^[a-zA-Z0-9_-]{1,64}$/.test(parts[1])) {
    throw new HttpsError('invalid-argument', 'Invalid subfolder identifier.');
  }
  return trimmed;
}

function hostForLog(raw: unknown): string {
  if (typeof raw !== 'string') return 'invalid';
  try {
    return new URL(raw.trim()).hostname;
  } catch {
    return 'invalid';
  }
}

/**
 * 2nd-gen Callable Cloud Function that fetches an external https image
 * server-to-server, checks its type and size, and saves it into Storage.
 * Admin only. The fetch refuses private networks, odd ports, and redirects
 * that were not checked again.
 */
export const importImageFromUrl = onCall(
  adminCallableOptions({ timeoutSeconds: 30, memory: '256MiB' }),
  async (request): Promise<ImportImageResponse> => {
    await requireRole(request, 'admin');
    const body = (request.data ?? {}) as ImportImageRequest;
    const folder = sanitizeFolder(body.folder ?? 'hero');

    const host = hostForLog(body.url);
    const uid = request.auth?.uid;
    let image: FetchedImage;
    try {
      if (typeof body.url !== 'string' || !body.url.trim()) {
        throw new HttpsError('invalid-argument', 'Please provide a valid web image link.');
      }

      const parsedUrl = assertSafeUrl(body.url.trim());
      image = await fetchImage(parsedUrl, {
        maxBytes: MAX_IMAGE_BYTES,
        allowedTypes: new Set(Object.keys(MIME_TO_EXT)),
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof ImageFetchError) {
        logger.warn('Blocked image import', { uid, host, reason: error.logReason });
        throw new HttpsError(error.code, error.message);
      }
      logger.warn('Blocked image import', { uid, host, reason: 'unreachable' });
      throw new HttpsError(
        'unavailable',
        'Could not reach that website to download the image. Please check the link or upload the file from your device.',
      );
    }

    const ext = MIME_TO_EXT[image.contentType];
    if (!ext) {
      throw new HttpsError(
        'invalid-argument',
        'That link does not point to a supported image file (JPG, PNG, WebP, or AVIF).',
      );
    }

    const uniquePath = `${folder}/imported-${Date.now()}.${ext}`;
    try {
      await getStorage().bucket().file(uniquePath).save(image.buffer, {
        resumable: false,
        metadata: {
          contentType: image.contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      logger.warn('Image import could not be saved', { uid, host, reason: 'storage-write' });
      throw new HttpsError('unavailable', 'The image could not be saved. Please try again.');
    }

    return { path: uniquePath };
  },
);
