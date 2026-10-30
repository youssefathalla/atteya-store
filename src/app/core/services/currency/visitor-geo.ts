import * as v from 'valibot';
import { IpWhoCountrySchema } from './visitor-geo.schema';

const ISO_COUNTRY = /^[A-Z]{2}$/;

/** Set on the Express request by server middleware before SSR (not from clients). */
export const VISITOR_COUNTRY_HEADER = 'x-atteya-visitor-country';

const HEADER_COUNTRY = [
  VISITOR_COUNTRY_HEADER,
  'cf-ipcountry',
  'x-country-code',
  'cloudfront-viewer-country',
  'x-appengine-country',
  'fastly-client-country',
  'x-vercel-ip-country',
] as const;

const GEO_LOOKUP_MS = 1200;

/**
 * Reads an ISO country from CDN or platform geo headers when present.
 * `X-Client-Geo-Location` uses `country=XX` (Google front ends).
 */
export function countryFromGeoHeaders(headers: Headers): string | null {
  for (const name of HEADER_COUNTRY) {
    const parsed = normalizeCountry(headers.get(name));
    if (parsed) return parsed;
  }
  const clientGeo = headers.get('x-client-geo-location');
  if (clientGeo) {
    const match = /(?:^|,|\s)country=([A-Za-z]{2})(?:,|$|\s)/i.exec(clientGeo);
    if (match) {
      const parsed = normalizeCountry(match[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

/**
 * Ensures geo resolution can use the visitor IP on App Hosting, where CDN geo
 * headers are absent and the socket may be the only hint before `X-Forwarded-For`.
 */
export function enrichHeadersForVisitorGeo(
  headers: Headers,
  remoteAddress: string | null | undefined,
): Headers {
  if (clientIpFromHeaders(headers)) return headers;
  const ip = normalizeIp(remoteAddress?.trim() ?? '');
  if (!ip || isPrivateIp(ip)) return headers;
  const enriched = new Headers(headers);
  enriched.set('x-forwarded-for', ip);
  return enriched;
}

/** First public client IP from forwarded headers or the socket address. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    for (const part of forwarded.split(',')) {
      const ip = normalizeIp(part.trim());
      if (ip && !isPrivateIp(ip)) return ip;
    }
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) {
    const ip = normalizeIp(realIp.trim());
    if (ip && !isPrivateIp(ip)) return ip;
  }
  return null;
}

/**
 * Header geo first, then a short IP lookup when a public address is known.
 * Used on SSR and on `/api/visitor-location` for client-rendered routes.
 */
export async function resolveVisitorCountry(
  headers: Headers,
  remoteAddress?: string | null,
): Promise<string | null> {
  const enriched = enrichHeadersForVisitorGeo(headers, remoteAddress);
  const fromHeader = countryFromGeoHeaders(enriched);
  if (fromHeader) return fromHeader;
  const ip = clientIpFromHeaders(enriched);
  if (!ip) return null;
  return lookupCountryByIp(ip);
}

export function headersFromRecord(
  record: Record<string, string | string[] | undefined>,
): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (code === 'XX' || code === 'T1') return null;
  return ISO_COUNTRY.test(code) ? code : null;
}

function normalizeIp(raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end > 0 ? raw.slice(1, end) : null;
  }
  if (raw.includes(':') && raw.includes('.')) {
    const last = raw.lastIndexOf(':');
    return raw.slice(0, last);
  }
  return raw;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

async function lookupCountryByIp(ip: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_MS);
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const parsed = v.safeParse(IpWhoCountrySchema, await response.json());
    if (!parsed.success) return null;
    return parsed.output.country_code;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
