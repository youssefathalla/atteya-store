---
name: seo-and-hosting
description: Canonical and share tags, category and brand share pictures, the sitemap, the own sign-in domain and auth proxy, allowed hosts, first paint hints and the service worker. Read it before changing SeoService, server.ts, sitemap.ts, apphosting*.yaml or sw.js.
---

# SEO and Hosting

Moved here word for word from AGENTS.md so that file stays small (<KEY>-282). The general Angular, Firebase and design rules stay in AGENTS.md.

**How to edit this file:** one fact per line, as a list item under the heading it belongs to. Add a new rule as its own line, or a new `##` heading for a new topic. Never join rules into one long paragraph: Git merges line by line, so two PRs that touch the same long line conflict even when they change different sentences.

## Own sign-in domain and auth proxy

- **Own sign-in domain (<KEY>-242)**: prod `authDomain` is `atteyastore.com` (dev stays `atteya-store-dev.firebaseapp.com`), so Google's account picker names our site.
- `src/server.ts` passes every request under `/__/auth/` and `/__/firebase/` to `https://<environment.firebase.projectId>.firebaseapp.com` (`firebaseAuthProxy()` in `src/firebase-auth-proxy.ts`, Node `fetch`), before static files and Angular; the host is fixed by the build and a path that resolves outside those two folders answers 404.
- The auth proxy forwards only an allowlist of request headers (no cookie, authorization or referer) and copies back only an allowlist of response headers (no Set-Cookie, HSTS or alt-svc); Firebase's `Cache-Control` is kept and `CDN-Cache-Control` is added only when it is cacheable; Firebase unreachable → 502 `no-store`.
- A new sign-in domain needs Firebase Authorized domains and its `/__/auth/handler` redirect URI on the OAuth Web client first.

## Canonical, share tags and sitemap

- **Canonical and share tags (<KEY>-243)**: `SeoService.setPageMetadata()` writes one `<link rel="canonical">` into the server HTML: `environment.baseUrl` + the route path, no query string (filtered Shop URLs point at `/shop`), no trailing slash except `/`.
- Every page that is not `noindex` also gets `og:title`, `og:description`, `og:url` (= canonical), `og:type`, `og:site_name`, `og:image` and `twitter:card`; a `noindex` page (account, checkout, favorites, login, search, sold-out or missing products) gets no canonical and no share tags.
- Product pages pass `type: 'product'`, the first photo (ImageKit, 1200 px wide) and the summary (fallback: description text); other pages share `public/img/share/atteya-store.png` (the logo on white, 1200×630). Share tags never carry prices.
- **Category and brand share pictures (<KEY>-263)**: a category page (`/category/<path>`, the Shop-style top-level pages and Bags) shares the category's Photo and `/brand/<slug>` the brand's Logo (ImageKit, 1200 px wide), with `og:image:alt` and `twitter:image:alt` from the photo's alt text (`SeoMetadata.imageAlt`; no alt tags on the store logo picture); no photo, or a hidden category or brand, shares the store logo picture.
- The category photo rides on the `shop-categories` TransferState seed (`ShopCategorySource.image`, only `path` and `alt`, `toShareImage()` in `core/services/products/utils/share-image.ts`); the brand logo on the `nav-auto-brands` seed (`NavAutoBrand.logo`), which `brandPageResolver` (`features/category/resolvers/`) reads on the server for every `/brand/<slug>` request; the browser reads nothing extra (live `CatalogService` lists).
- `/terms` and `/privacy` are indexable (no `noindex`).
- Dev `baseUrl` is the dev hosted.app address, and every dev response carries `X-Robots-Tag: noindex, nofollow` (`src/server.ts`, when `!environment.production`), so the dev copy is never indexed.
- **Sitemap (<KEY>-243)**: `GET /sitemap.xml` (`src/sitemap.ts`, registered in `src/server.ts` before static files and Angular) lists `/`, `/shop`, `/brands`, `/terms`, `/privacy` and every published category (`/category/<path>`), brand (`/brand/<slug>`) and in-stock product (`/product/<slug>`).
- Sitemap `<lastmod>` comes from `updatedAt`; `<loc>` uses the same `canonicalUrl()` as the pages (`seo-urls.ts`).
- The sitemap reads Firestore with the client SDK on its own `sitemap` Firebase app (`published == true`, 500 per page by document id, at most 20,000 per collection).
- The sitemap is built once per hour per server (one read at a time) and sent with `Cache-Control: public, max-age=3600`.
- A failed or slow (20 s) sitemap read answers 503, never an empty sitemap.
- `public/robots.txt` names `https://atteyastore.com/sitemap.xml`.

## Hosting, first paint and service worker

- **Allowed hosts (prod)**: `angular.json` `security.allowedHosts` is empty, so the server-rendered site answers only the hosts in `NG_ALLOWED_HOSTS`. `apphosting.production.yaml` sets it to the prod Cloud Run service host (`atteya-store-391723202247.europe-west4.run.app`, which App Hosting forwards every request with; leaving it out makes every page answer 400), `www.atteyastore.com`, `atteyastore.com` and the prod hosted.app address; a new domain must be added there before DNS points at App Hosting, or every page answers 400.
- **First paint hints**: Rendered HTML does not keep `modulepreload` or font `preload` links (`src/early-hints.mjs`, applied in `src/server.ts` and after `ng build`). Those hints finish before first paint on a fast connection, so Lighthouse's simulated throttling counts them as FCP (about 600 KB and a 3 s FCP) even though the server HTML and inlined CSS already paint. The empty client shell (`/login`, `/admin`, `index.csr.html`) keeps its script preloads. Text fonts stay `font-display: swap`; the icon font stays `font-display: block` and still loads from CSS. App Check and reCAPTCHA load after first paint via a lazy `firebase/app-check` import in `provideAppCheck` (`afterNextRender`); monitoring stays off until verified traffic is above 0%.
- **Service worker** (`public/sw.js`, cache `atteya-store-v2`): cache-first only for hashed root build files (`name-XXXXXXXX.js|css`) and `/fonts/*.woff2`. It never caches HTML, `sw.js`, the manifest, icons or images. Activate deletes every other `atteya-store-*` cache, and the cache is capped at 200 entries. A changed font must get a **new file name** (fonts are cached forever). Bump `CACHE_NAME` only when the caching rules change. It's registered in `src/main.ts` outside dev mode only (`ng serve` unregisters it). `src/server.ts` serves `sw.js` as `no-store`, hashed files, fonts and `/media` as 1-year `immutable`, and other public files for 1 hour. Keep `HASHED_BUILD_FILE` identical in `sw.js` and `server.ts`. For App Hosting's Cloud CDN, `src/cdn-cache-control.mjs` copies only **cacheable** `Cache-Control` values into `CDN-Cache-Control` (static assets with `max-age` / `immutable`). Geo-priced HTML uses `private, no-store`, so **no** public `CDN-Cache-Control` is emitted for those responses.
