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

/** Request headers Firebase's helper pages may use. Everything else (host, cookie, auth, hop-by-hop, forwarding) stays here. */
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'cache-control',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'referer',
  'user-agent',
];

/** Response headers never copied back: hop-by-hop, plus the encoding and length of a body `fetch` already decoded. */
const DROPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
  'set-cookie',
  'alt-svc',
]);

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

/** Express middleware that passes Firebase helper requests to `https://<projectId>.firebaseapp.com`. */
export function firebaseAuthProxy(projectId: string) {
  const origin = `https://${projectId}.firebaseapp.com`;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // originalUrl keeps the mount prefix and the query string; resolving against the
      // fixed origin means the host can never come from the request.
      const target = new URL(req.originalUrl, origin);
      if (target.origin !== origin) {
        res.status(400).end();
        return;
      }

      const headers = new Headers();
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name];
        if (typeof value === 'string') headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(', '));
      }

      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const body = hasBody ? await readBody(req) : undefined;
      if (body === null) {
        res.status(413).end();
        return;
      }

      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: body ? new Uint8Array(body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      res.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) res.setHeader(name, value);
      });
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
      // Keep Firebase's own Cache-Control; the CDN copy only when it is cacheable.
      res.removeHeader('CDN-Cache-Control');
      const cdn = cdnCacheControlHeader(upstream.headers.get('cache-control'));
      if (cdn) res.setHeader('CDN-Cache-Control', cdn);

      if (req.method === 'HEAD' || upstream.body === null) {
        res.end();
        return;
      }
      res.end(Buffer.from(await upstream.arrayBuffer()));
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

/** Reads the request body, or null when it is larger than the limit. */
function readBody(req: Request): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
