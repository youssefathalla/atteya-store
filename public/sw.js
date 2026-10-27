// Atteya Store service worker v2.
// Caches only files whose URL changes when their content changes:
//  - Angular build output with a content hash in the name (main-WMS4C3OD.js, chunk-C-heo7oH.js, styles-ZVAUSNV5.css)
//  - /fonts/*.woff2 (rule: a changed font gets a new file name, see AGENTS.md)
// Never caches HTML, sw.js, the manifest, icons, images, query-string URLs or anything cross-origin.
// Bump CACHE_NAME only when these caching rules change. Activate deletes every other atteya-store-* cache.
const CACHE_PREFIX = 'atteya-store-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const MAX_ENTRIES = 200;
const HASHED_BUILD_FILE = /^\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/;
const FONT_FILE = /^\/fonts\/[A-Za-z0-9_.-]+\.woff2$/;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode === 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search) return;
  if (!HASHED_BUILD_FILE.test(url.pathname) && !FONT_FILE.test(url.pathname)) return;
  event.respondWith(cacheFirst(event, request));
});

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    event.waitUntil(cache.put(request, response.clone()).then(() => trim(cache)));
  }
  return response;
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - MAX_ENTRIES;
  if (extra > 0) await Promise.all(keys.slice(0, extra).map((key) => cache.delete(key)));
}
