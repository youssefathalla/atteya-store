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
import { canonicalUrl } from './app/core/services/seo/seo-urls.js';
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
const STATIC_PATHS = ['', 'shop', 'brands', 'terms', 'privacy'] as const;

const SlugDocSchema = v.object({ slug: v.pipe(v.string(), v.trim(), v.minLength(1)) });
const CategoryDocSchema = v.object({ path: v.pipe(v.string(), v.trim(), v.minLength(1)) });
/** Same availability rule as the product page: a stock count wins, else the `inStock` flag (missing = in stock). */
const ProductStockSchema = v.object({
  stock: v.optional(v.unknown()),
  inStock: v.optional(v.unknown()),
});

interface SitemapEntry {
  readonly path: string;
  readonly lastmod: string | null;
}

let cached: { readonly xml: string; readonly expiresAt: number } | null = null;
/** One catalogue read at a time: requests that arrive while it runs wait for the same read. */
let inflight: Promise<string> | null = null;

/**
 * `GET /sitemap.xml`: home, Shop, Brands, Terms, Privacy, every published category,
 * brand and product, read from Firestore on request (published docs only) and kept
 * for an hour. A failed read answers 503, never an empty sitemap.
 */
export function sitemapHandler(baseUrl: string, firebase: FirebaseOptions) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const xml = await sitemapXmlCached(baseUrl, firebase);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', SITEMAP_CACHE_CONTROL);
      const cdn = cdnCacheControlHeader(SITEMAP_CACHE_CONTROL);
      if (cdn) res.setHeader('CDN-Cache-Control', cdn);
      res.send(xml);
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

async function sitemapXmlCached(baseUrl: string, firebase: FirebaseOptions): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.xml;
  inflight ??= readSitemapEntries(sitemapFirestore(firebase))
    .then((entries) => {
      const xml = sitemapXml(baseUrl, entries);
      cached = { xml, expiresAt: Date.now() + CACHE_MS };
      return xml;
    })
    .finally(() => {
      inflight = null;
    });
  return withTimeout(inflight, READ_TIMEOUT_MS);
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
      return parsed.success ? entry(`/category/${parsed.output.path}`, doc) : null;
    }),
    readPublished(db, 'brands', (doc) => {
      const parsed = v.safeParse(SlugDocSchema, doc.data());
      return parsed.success ? entry(`/brand/${parsed.output.slug}`, doc) : null;
    }),
    // A sold-out product page is noindex, so it stays out of the sitemap.
    readPublished(db, 'products', (doc) => {
      const parsed = v.safeParse(SlugDocSchema, doc.data());
      return parsed.success && isInStock(doc.data()) ? entry(`/product/${parsed.output.slug}`, doc) : null;
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

function isInStock(data: DocumentData): boolean {
  const parsed = v.safeParse(ProductStockSchema, data);
  if (!parsed.success) return false;
  const { stock, inStock } = parsed.output;
  if (typeof stock === 'number') return stock > 0;
  return inStock !== false;
}

/** The page's address and `<lastmod>` from `updatedAt` when it is a Timestamp, Date or date string. */
function entry(path: string, doc: QueryDocumentSnapshot<DocumentData>): SitemapEntry {
  return { path: path.split('/').filter(Boolean).join('/'), lastmod: lastModified(doc.get('updatedAt')) };
}

function lastModified(value: unknown): string | null {
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : value instanceof Date
        ? value
        : typeof value === 'string'
          ? new Date(value)
          : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function sitemapXml(baseUrl: string, entries: readonly SitemapEntry[]): string {
  const urls = entries.map((item) => {
    const lastmod = item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : '';
    return `  <url><loc>${escapeXml(canonicalUrl(baseUrl, item.path.split('/')))}</loc>${lastmod}</url>`;
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
