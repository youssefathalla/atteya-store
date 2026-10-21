import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { adminCallableOptions } from './auth/callable-options.js';
import { requireRole } from './auth/require-role.js';

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

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === 'metadata.google.internal' ||
    lower.endsWith('.local') ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('169.254.')
  );
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

function parseRemoteImageUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new HttpsError('invalid-argument', 'Please provide a valid web image link.');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new HttpsError('invalid-argument', 'The provided image link is not a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpsError('invalid-argument', 'Only HTTP and HTTPS image links are supported.');
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new HttpsError('invalid-argument', 'Private or local network addresses are not allowed.');
  }
  return parsed;
}

/**
 * 2nd-gen Callable Cloud Function that fetches an external image URL server-to-server
 * (bypassing browser CORS restrictions), validates its MIME type and byte size,
 * and saves it directly into the active Firebase Storage bucket.
 */
export const importImageFromUrl = onCall(
  adminCallableOptions({ timeoutSeconds: 30, memory: '256MiB' }),
  async (request): Promise<ImportImageResponse> => {
    requireRole(request, 'admin');
    const body = (request.data ?? {}) as ImportImageRequest;
    const parsedUrl = parseRemoteImageUrl(body.url);
    const folder = sanitizeFolder(body.folder ?? 'hero');

    let response: Response;
    try {
      response = await fetch(parsedUrl.toString(), {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
          'User-Agent': 'AtteyaStoreImageImporter/1.0',
        },
        redirect: 'follow',
      });
    } catch {
      throw new HttpsError(
        'unavailable',
        'Could not reach that website to download the image. Please check the link or upload the file from your device.',
      );
    }

    if (!response.ok) {
      throw new HttpsError(
        'failed-precondition',
        `That website refused the download (HTTP ${response.status}). Please save the image to your device and use Upload Image.`,
      );
    }

    const contentTypeHeader = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[contentTypeHeader];
    if (!ext) {
      throw new HttpsError(
        'invalid-argument',
        'That link does not point to a supported image file (JPG, PNG, WebP, or AVIF).',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new HttpsError('invalid-argument', 'The downloaded image file is empty.');
    }
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new HttpsError('invalid-argument', 'The image is larger than the 10MB limit.');
    }

    const uniquePath = `${folder}/imported-${Date.now()}.${ext}`;
    const bucket = getStorage().bucket();
    const file = bucket.file(uniquePath);

    await file.save(Buffer.from(arrayBuffer), {
      resumable: false,
      metadata: {
        contentType: contentTypeHeader,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return { path: uniquePath };
  },
);
