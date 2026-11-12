import type { NextFunction, Request, Response } from 'express';
import { cdnCacheControlHeader } from './cdn-cache-control.mjs';

/**
 * Firebase Auth's helper pages (`/__/auth/handler`, `/__/auth/iframe.js`,
 * `/__/firebase/init.json`, …) are served by Firebase Hosting on
 * `<projectId>.firebaseapp.com`. App Hosting does not serve them, so when
 * `authDomain` is our own domain this server passes those requests through.
 * Only these two prefixes are proxied, and the target host is fixed by the build.
 */
export const FIREBASE_HELPER_PATHS = ['/__/auth', '/__/firebase'];

/**
 * Request headers Firebase's helper pages may use. Everything else (host, cookie,
 * authorization, referer with the visitor's page URL, hop-by-hop, forwarding) stays here.
 */
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'cache-control',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'user-agent',
];

/**
 * Response headers copied back. An allowlist, so firebaseapp.com's own policies
 * (HSTS with includeSubDomains, NEL / Report-To, cookies, alt-svc) never land on
 * our domain, and the encoding and length of a body `fetch` already decoded are not repeated.
 */
const FORWARDED_RESPONSE_HEADERS = [
  'cache-control',
  'content-language',
  'content-security-policy',
  'content-type',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'etag',
  'expires',
  'last-modified',
  'location',
  'permissions-policy',
  'referrer-policy',
  'vary',
  'x-content-type-options',
  'x-frame-options',
];

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

/** Express middleware that passes Firebase helper requests to `https://<projectId>.firebaseapp.com`. */
export function firebaseAuthProxy(projectId: string) {
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    throw new Error('firebaseAuthProxy needs the Firebase projectId from the environment.');
  }
  const origin = `https://${projectId}.firebaseapp.com`;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // originalUrl keeps the mount prefix and the query string; resolving against the
    // fixed origin means the host can never come from the request. Dot segments are
    // resolved first, so the result must still sit under one of the helper paths.
    const target = new URL(req.originalUrl, origin);
    if (target.origin !== origin || !isHelperPath(target.pathname)) {
      res.status(404).setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    try {
      const headers = new Headers();
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name];
        if (typeof value === 'string') headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(', '));
      }

      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const body = hasBody ? await readBody(req) : undefined;
      if (body === null) {
        res.status(413).setHeader('Connection', 'close');
        res.end(() => req.destroy());
        return;
      }

      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: body ? new Uint8Array(body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      // Read the whole body before any header is set, so a failure here leaves a clean 502.
      const payload = req.method === 'HEAD' ? null : Buffer.from(await upstream.arrayBuffer());

      res.status(upstream.status);
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value !== null) res.setHeader(name, value);
      }
      // Keep Firebase's own Cache-Control; the CDN copy only when it is cacheable.
      const cdn = cdnCacheControlHeader(upstream.headers.get('cache-control'));
      if (cdn) res.setHeader('CDN-Cache-Control', cdn);
      res.end(payload ?? undefined);
    } catch (error) {
      if (res.headersSent) {
        next(error);
        return;
      }
      res.status(502).setHeader('Cache-Control', 'no-store');
      res.end();
    }
  };
}

function isHelperPath(pathname: string): boolean {
  return FIREBASE_HELPER_PATHS.some((prefix) => pathname.startsWith(`${prefix}/`));
}

/** Reads the request body, or null as soon as it is larger than the limit. */
function readBody(req: Request): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        cleanup();
        req.pause();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = (): void => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error('The request closed before its body arrived.'));
    };
    const cleanup = (): void => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onClose);
      req.off('close', onClose);
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onClose);
    req.on('close', onClose);
  });
}
