import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import compression from 'compression';
import express from 'express';
import { join, relative, sep } from 'node:path';
import { applyCdnCacheControl, cdnCacheControlHeader } from './cdn-cache-control.mjs';
import * as v from 'valibot';
import { trimRenderedEarlyHints } from './early-hints.mjs';
import {
  enrichHeadersForVisitorGeo,
  headersFromRecord,
  resolveVisitorCountry,
  stripUntrustedVisitorCountry,
  VISITOR_COUNTRY_HEADER,
} from './app/core/services/currency/visitor-geo.js';
import { VisitorLocationResponseSchema } from './app/core/services/currency/visitor-geo.schema.js';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({ trustProxyHeaders: true });

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Angular build output with a content hash, e.g. main-WMS4C3OD.js, chunk-C-heo7oH.js. Keep in sync with public/sw.js. */
const HASHED_BUILD_FILE = /^\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;

/** sw.js never cached (browsers and CDN always see the newest), hashed files and fonts forever, other public files 1 hour. */
function staticCacheControl(urlPath: string): string {
  if (urlPath === '/sw.js') return 'no-store';
  if (HASHED_BUILD_FILE.test(urlPath) || urlPath.startsWith('/fonts/') || urlPath.startsWith('/media/')) {
    return IMMUTABLE;
  }
  return 'public, max-age=3600';
}

app.use(compression({ threshold: 1024 }));

app.get('/api/visitor-location', async (req, res) => {
  try {
    const headers = visitorLocationHeaders(req);
    const country = await resolveVisitorCountry(headers, req.socket.remoteAddress);
    const payload = v.parse(VisitorLocationResponseSchema, { country });
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(payload);
  } catch {
    res.status(500).json({ country: null });
  }
});

function visitorLocationHeaders(req: express.Request): Headers {
  delete req.headers[VISITOR_COUNTRY_HEADER];
  const headers = headersFromRecord(
    req.headers as Record<string, string | string[] | undefined>,
  );
  return enrichHeadersForVisitorGeo(stripUntrustedVisitorCountry(headers), req.socket.remoteAddress);
}

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    index: false,
    redirect: false,
    cacheControl: false,
    setHeaders: (res, filePath) => {
      const urlPath = '/' + relative(browserDistFolder, filePath).split(sep).join('/');
      const cacheControl = staticCacheControl(urlPath);
      res.setHeader('Cache-Control', cacheControl);
      const cdn = cdnCacheControlHeader(cacheControl);
      if (cdn) res.setHeader('CDN-Cache-Control', cdn);
    },
  }),
);

/** Resolve geo once per SSR document (after static; no ipwho for favicon, icons, etc.). */
app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  delete req.headers[VISITOR_COUNTRY_HEADER];
  try {
    const headers = visitorLocationHeaders(req);
    const country = await resolveVisitorCountry(headers, req.socket.remoteAddress);
    if (country) {
      req.headers[VISITOR_COUNTRY_HEADER] = country;
    }
  } catch {
    // Unknown geo; CurrencyService falls back like before.
  }
  next();
});

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then(async (response) => {
      if (!response) return next();
      return writeResponseToNodeResponse(await presentRenderedHtml(response), res);
    })
    .catch(next);
});

/**
 * Rendered documents paint from server HTML. Drop modulepreload and font preload
 * hints so they are not on the simulated first-paint path. A content-length from
 * the untouched body would no longer match.
 */
async function presentRenderedHtml(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') || response.body === null) return response;
  const html = await response.text();
  const trimmed = trimRenderedEarlyHints(html);
  if (trimmed === html) {
    const headers = new Headers(response.headers);
    applyCdnCacheControl(headers);
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  applyCdnCacheControl(headers);
  return new Response(trimmed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
