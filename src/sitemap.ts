import type { Request, Response } from 'express';
import { type FirebaseApp, type FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import {
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  Timestamp,
  collection,
  documentId,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import * as v from 'valibot';
import { cdnCacheControlHeader } from './cdn-cache-control.mjs';

/** Same for every visitor (no prices), so the CDN may keep it for an hour. */
const SITEMAP_CACHE_CONTROL = 'public, max-age=3600';
const CACHE_MS = 60 * 60 * 1000;
const PAGE_SIZE = 500;
/** 40 pages of 500 = 20,000 docs per collection, well under the 50,000-URL sitemap limit. */
const MAX_PAGES = 40;
const READ_TIMEOUT_MS = 20_000;
/** Own app name, so the store's default app and its Firestore settings are never touched here. */
const SITEMAP_APP_NAME = 'sitemap';

/** Public pages that always exist. */
const STATIC_PATHS = ['/', '/shop', '/brands', '/terms', '/privacy'] as const;

const UpdatedAtSchema = v.optional(v.nullable(v.instance(Timestamp)), null);
const SlugDocSchema = v.object({
  slug: v.pipe(v.string(), v.trim(), v.minLength(1)),
  updatedAt: UpdatedAtSchema,
});
const CategoryDocSchema = v.object({
  path: v.pipe(v.string(), v.trim(), v.minLength(1)),
  updatedAt: UpdatedAtSchema,
});

interface SitemapEntry {
  readonly path: string;
  readonly lastmod: string | null;
}

let cached: { readonly xml: string; readonly expiresAt: number } | null = null;

/**
 * `GET /sitemap.xml`: home, Shop, Brands, Terms, Privacy, every published category,
 * brand and product, read from Firestore on request (published docs only) and kept
 * for an hour. A failed read answers 503, never an empty sitemap.
 */
export function sitemapHandler(baseUrl: string, firebase: FirebaseOptions) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const now = Date.now();
      if (!cached || cached.expiresAt <= now) {
        const entries = await withTimeout(readSitemapEntries(sitemapFirestore(firebase)), READ_TIMEOUT_MS);
        cached = { xml: sitemapXml(baseUrl, entries), expiresAt: now + CACHE_MS };
      }
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', SITEMAP_CACHE_CONTROL);
      const cdn = cdnCacheControlHeader(SITEMAP_CACHE_CONTROL);
      if (cdn) res.setHeader('CDN-Cache-Control', cdn);
      res.send(cached.xml);
    } catch (error) {
      console.error('sitemap.xml: catalogue read failed', error);
      res.setHeader('Cache-Control', 'no-store');
      res
        .status(503)
        .type('text/plain')
        .send('The sitemap is not available right now. Please try again shortly.');
    }
  };
}

function sitemapFirestore(options: FirebaseOptions): Firestore {
  const app: FirebaseApp = getApps().some((a) => a.name === SITEMAP_APP_NAME)
    ? getApp(SITEMAP_APP_NAME)
    : initializeApp(options, SITEMAP_APP_NAME);
  return getFirestore(app);
}

async function readSitemapEntries(db: Firestore): Promise<SitemapEntry[]> {
  const [categories, brands, products] = await Promise.all([
    readPublished(db, 'categories', (doc) => {
      const parsed = v.safeParse(CategoryDocSchema, doc.data());
      return parsed.success
        ? entry(`/category/${encodePath(parsed.output.path)}`, parsed.output.updatedAt)
        : null;
    }),
    readPublished(db, 'brands', (doc) => {
      const parsed = v.safeParse(SlugDocSchema, doc.data());
      return parsed.success
        ? entry(`/brand/${encodePath(parsed.output.slug)}`, parsed.output.updatedAt)
        : null;
    }),
    readPublished(db, 'products', (doc) => {
      const parsed = v.safeParse(SlugDocSchema, doc.data());
      return parsed.success
        ? entry(`/product/${encodePath(parsed.output.slug)}`, parsed.output.updatedAt)
        : null;
    }),
  ]);
  const all = [
    ...STATIC_PATHS.map((path) => ({ path, lastmod: null })),
    ...categories,
    ...brands,
    ...products,
  ];
  const seen = new Set<string>();
  return all.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

/** Every published doc of a collection, 500 at a time in document-id order. */
async function readPublished(
  db: Firestore,
  name: string,
  toEntry: (doc: QueryDocumentSnapshot<DocumentData>) => SitemapEntry | null,
): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const published = where('published', '==', true);
    const q: Query<DocumentData> = last
      ? query(collection(db, name), published, orderBy(documentId()), startAfter(last), limit(PAGE_SIZE))
      : query(collection(db, name), published, orderBy(documentId()), limit(PAGE_SIZE));
    const snap: QuerySnapshot<DocumentData> = await getDocs(q);
    for (const doc of snap.docs) {
      const item = toEntry(doc);
      if (item) entries.push(item);
    }
    if (snap.docs.length < PAGE_SIZE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return entries;
}

function entry(path: string, updatedAt: Timestamp | null): SitemapEntry {
  return { path, lastmod: updatedAt ? updatedAt.toDate().toISOString() : null };
}

/** `accessories/bags` → `accessories/bags` with each segment URL-encoded. */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sitemapXml(baseUrl: string, entries: readonly SitemapEntry[]): string {
  let origin = baseUrl.trim();
  while (origin.endsWith('/')) origin = origin.slice(0, -1);
  const urls = entries.map((item) => {
    const lastmod = item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : '';
    return `  <url><loc>${escapeXml(`${origin}${item.path}`)}</loc>${lastmod}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
