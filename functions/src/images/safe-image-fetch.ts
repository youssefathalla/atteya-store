import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import type { IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

const DEADLINE_MS = 10_000;
const IDLE_MS = 5_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal']);

const blocked = new BlockList();

blocked.addSubnet('0.0.0.0', 8, 'ipv4');
blocked.addSubnet('10.0.0.0', 8, 'ipv4');
blocked.addSubnet('100.64.0.0', 10, 'ipv4');
blocked.addSubnet('127.0.0.0', 8, 'ipv4');
blocked.addSubnet('169.254.0.0', 16, 'ipv4');
blocked.addSubnet('172.16.0.0', 12, 'ipv4');
blocked.addSubnet('192.0.0.0', 24, 'ipv4');
blocked.addSubnet('192.0.2.0', 24, 'ipv4');
blocked.addSubnet('192.88.99.0', 24, 'ipv4');
blocked.addSubnet('192.168.0.0', 16, 'ipv4');
blocked.addSubnet('198.18.0.0', 15, 'ipv4');
blocked.addSubnet('198.51.100.0', 24, 'ipv4');
blocked.addSubnet('203.0.113.0', 24, 'ipv4');
blocked.addSubnet('224.0.0.0', 4, 'ipv4');
blocked.addSubnet('240.0.0.0', 4, 'ipv4');

blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
blocked.addSubnet('64:ff9b::', 96, 'ipv6');
blocked.addSubnet('100::', 64, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');
blocked.addSubnet('ff00::', 8, 'ipv6');

export type ImageFetchCode =
  | 'invalid-argument'
  | 'deadline-exceeded'
  | 'failed-precondition'
  | 'unavailable';

export class ImageFetchError extends Error {
  readonly code: ImageFetchCode;
  readonly logReason: string;

  constructor(code: ImageFetchCode, message: string, logReason: string) {
    super(message);
    this.name = 'ImageFetchError';
    this.code = code;
    this.logReason = logReason;
  }
}

export interface FetchImageOptions {
  readonly maxBytes: number;
  readonly allowedTypes: ReadonlySet<string>;
}

export interface FetchedImage {
  readonly buffer: Buffer;
  readonly contentType: string;
}

const REFUSED = 'Private or local network addresses are not allowed and were refused.';
const UNREACHABLE =
  'Could not reach that website to download the image. Please check the link or upload the file from your device.';
const UNSUPPORTED =
  'That link does not point to a supported image file (JPG, PNG, WebP, or AVIF).';
const TOO_LARGE = 'The image is larger than the 10MB limit.';
const TOO_SLOW = 'The image took too long to download. Please try again.';

/** Fail closed: anything that is not a usable IP is blocked. */
export function isBlockedAddress(ip: string, family: 4 | 6): boolean {
  if (isIP(ip) === 0) return true;
  try {
    if (family === 6) {
      const mapped = ipv4FromMapped(ip);
      if (mapped === 'invalid') return true;
      if (mapped) return isBlockedAddress(mapped, 4);
      if (isIP(ip) !== 6) return true;
      return blocked.check(ip, 'ipv6');
    }
    if (isIP(ip) !== 4) return true;
    return blocked.check(ip, 'ipv4');
  } catch {
    return true;
  }
}

/**
 * Lookup for `https.request`. Resolves every address, rejects the host if any
 * of them is blocked, and returns only the first checked address so the socket
 * cannot be swapped by DNS rebinding.
 */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    if (addresses.length === 0 || addresses.some((entry) => isBlockedLookup(entry))) {
      const refused = new Error(REFUSED) as NodeJS.ErrnoException;
      refused.code = 'EBLOCKED';
      callback(refused, '', 0);
      return;
    }
    const first = addresses[0];
    if (options.all === true) {
      callback(null, [{ address: first.address, family: first.family }]);
      return;
    }
    callback(null, first.address, first.family);
  });
};

export function assertSafeUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ImageFetchError(
      'invalid-argument',
      'The provided image link is not a valid URL.',
      'bad-url',
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new ImageFetchError(
      'invalid-argument',
      'Only https image links are supported. This link was refused.',
      'non-https',
    );
  }
  if (parsed.port !== '' && parsed.port !== '443') {
    throw new ImageFetchError('invalid-argument', 'That image link was refused.', 'bad-port');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ImageFetchError('invalid-argument', 'That image link was refused.', 'credentials');
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal')
  ) {
    throw new ImageFetchError('invalid-argument', REFUSED, 'blocked-hostname');
  }

  const version = isIP(host);
  if (version === 4 && isBlockedAddress(host, 4)) {
    throw new ImageFetchError('invalid-argument', REFUSED, 'blocked-ip');
  }
  if (version === 6 && isBlockedAddress(host, 6)) {
    throw new ImageFetchError('invalid-argument', REFUSED, 'blocked-ip');
  }

  return parsed;
}

export async function fetchImage(start: URL, options: FetchImageOptions): Promise<FetchedImage> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);

  try {
    let current = start;
    for (let redirects = 0; ; redirects += 1) {
      const outcome = await requestOnce(current, options, controller.signal);
      if (outcome.kind === 'image') return outcome.image;
      if (redirects >= MAX_REDIRECTS) {
        throw new ImageFetchError(
          'invalid-argument',
          'That image link was refused.',
          'redirect-limit',
        );
      }
      current = assertSafeUrl(resolveRedirect(outcome.location, current));
    }
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof ImageFetchError)) {
      throw new ImageFetchError('deadline-exceeded', TOO_SLOW, 'timeout');
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

type RequestOutcome =
  | { readonly kind: 'image'; readonly image: FetchedImage }
  | { readonly kind: 'redirect'; readonly location: string };

function requestOnce(
  url: URL,
  options: FetchImageOptions,
  signal: AbortSignal,
): Promise<RequestOutcome> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new ImageFetchError('deadline-exceeded', TOO_SLOW, 'timeout'));
      return;
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const requestOptions: RequestOptions & { autoSelectFamily: boolean } = {
      protocol: 'https:',
      hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        'user-agent': 'atteya-store-image-import',
        accept: 'image/avif,image/webp,image/png,image/jpeg',
      },
      lookup: safeLookup,
      servername: hostname,
      autoSelectFamily: false,
      signal,
    };
    const req = httpsRequest(requestOptions, (res) => {
        const status = res.statusCode ?? 0;
        if (REDIRECT_STATUSES.has(status)) {
          const location = headerValue(res.headers.location).trim();
          res.resume();
          if (!location) {
            reject(
              new ImageFetchError(
                'failed-precondition',
                'That website refused the download. Please save the image to your device and use Upload Image.',
                'missing-location',
              ),
            );
            return;
          }
          resolve({ kind: 'redirect', location });
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(
            new ImageFetchError(
              'failed-precondition',
              'That website refused the download. Please save the image to your device and use Upload Image.',
              'upstream-status',
            ),
          );
          return;
        }

        const contentType = canonicalContentType(headerValue(res.headers['content-type']));
        if (!options.allowedTypes.has(contentType)) {
          res.resume();
          reject(new ImageFetchError('invalid-argument', UNSUPPORTED, 'content-type'));
          return;
        }

        const declared = contentLength(res.headers['content-length']);
        if (declared === 'invalid' || (typeof declared === 'number' && declared > options.maxBytes)) {
          res.resume();
          reject(new ImageFetchError('invalid-argument', TOO_LARGE, 'too-large'));
          return;
        }

        void readCapped(res, options.maxBytes)
          .then((buffer) => {
            if (buffer.length === 0) {
              reject(new ImageFetchError('invalid-argument', 'The downloaded image file is empty.', 'empty'));
              return;
            }
            if (!magicMatches(buffer, contentType)) {
              reject(new ImageFetchError('invalid-argument', UNSUPPORTED, 'magic-mismatch'));
              return;
            }
            resolve({ kind: 'image', image: { buffer, contentType } });
          })
          .catch((error: unknown) => {
            reject(error instanceof ImageFetchError ? error : new ImageFetchError('unavailable', UNREACHABLE, 'stream-error'));
          });
    });

    req.setTimeout(IDLE_MS, () => {
      req.destroy(new ImageFetchError('deadline-exceeded', TOO_SLOW, 'idle-timeout'));
    });

    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error instanceof ImageFetchError) {
        reject(error);
        return;
      }
      if (signal.aborted || error.code === 'ABORT_ERR') {
        reject(new ImageFetchError('deadline-exceeded', TOO_SLOW, 'timeout'));
        return;
      }
      if (error.code === 'EBLOCKED') {
        reject(new ImageFetchError('invalid-argument', REFUSED, 'blocked-ip'));
        return;
      }
      reject(new ImageFetchError('unavailable', UNREACHABLE, 'unreachable'));
    });

    req.end();
  });
}

async function readCapped(res: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      res.destroy();
      throw new ImageFetchError('invalid-argument', TOO_LARGE, 'too-large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total);
}

function isBlockedLookup(entry: LookupAddress): boolean {
  const family = entry.family === 6 ? 6 : entry.family === 4 ? 4 : 0;
  if (family === 0) return true;
  return isBlockedAddress(entry.address, family);
}

/** `null` means this is not an IPv4-mapped address. `'invalid'` fails closed. */
function ipv4FromMapped(ip: string): string | null | 'invalid' {
  const lower = ip.toLowerCase();
  const at = lower.lastIndexOf('ffff:');
  if (at === -1) return null;
  if (!/^[:0]*$/.test(lower.slice(0, at))) return null;

  const rest = lower.slice(at + 'ffff:'.length);
  if (isIP(rest) === 4) return rest;

  const halves = rest.split(':');
  if (halves.length !== 2 || halves[0] === '' || halves[1] === '') return 'invalid';
  const high = Number.parseInt(halves[0], 16);
  const low = Number.parseInt(halves[1], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) {
    return 'invalid';
  }
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function resolveRedirect(location: string, current: URL): string {
  try {
    return new URL(location, current).toString();
  } catch {
    throw new ImageFetchError('invalid-argument', 'That image link was refused.', 'bad-redirect');
  }
}

/**
 * Some stores send JPEGs as the non-standard `image/jpg`.
 * Fold that alias to `image/jpeg` before the type and magic-byte checks.
 */
export function canonicalContentType(header: string): string {
  const type = header.split(';')[0].trim().toLowerCase();
  if (type === 'image/jpg') return 'image/jpeg';
  return type;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function contentLength(value: string | string[] | undefined): number | 'invalid' | undefined {
  if (Array.isArray(value)) return 'invalid';
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) return 'invalid';
  const length = Number(value);
  if (!Number.isSafeInteger(length)) return 'invalid';
  return length;
}

/**
 * AVIF is an ISO-BMFF `ftyp` box. The major brand is often `mif1` or `miaf`,
 * with `avif` or `avis` listed later as a compatible brand.
 */
function avifBrandMatches(buffer: Buffer): boolean {
  if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > buffer.length) return false;

  for (let offset = 8; offset + 4 <= boxSize; offset += 4) {
    if (offset === 12) continue;
    const brand = buffer.toString('ascii', offset, offset + 4);
    if (brand === 'avif' || brand === 'avis') return true;
  }
  return false;
}

function magicMatches(buffer: Buffer, contentType: string): boolean {
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (contentType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (contentType === 'image/avif') return avifBrandMatches(buffer);
  return false;
}
