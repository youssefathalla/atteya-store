---
name: storefront-loading
description: Anti-flicker policy for storefront UI that depends on Firestore settings, Auth, geo/currency, or SSR data. Use when adding or changing layout chrome, settings-driven copy, route bodies from Firestore, or any async storefront surface where wrong first paint would mislead visitors.
---

# Storefront async UI & anti-flicker

**Goal:** Visitors must not see **wrong or half-ready** chrome (nav, prices, shipping bar, account affordances) that **changes a moment later**. Prefer **loading or reserved space** over flicker and layout jump.

This is **not** a permanent full-screen blocker on every navigation.

---

## Three tiers

### Tier 1 — Route-critical data (blocking before the page)

Use **blocking resolvers** / route `resources` (SSR + `TransferState`) when the **page body** depends on server data.

- Examples: `productPageResolver`, `homeSettingsResolver`, `serverCurrencyResolver`, `shippingSettingsResolver`, `navigationSettingsResolver` (main layout).
- **Rule:** If showing the route without data would mislead (404, wrong SSR price, empty hero), resolve on the server first **or** show a dedicated loading/error shell for that route — not an empty template that fills in later.
- **Client navigation:** a server-only resolver leaves later in-app visits with no data. Make it wait in the browser too (`homeSettingsResolver` awaits `HomeService.whenReady()`: seed, a schema-checked saved copy, or the first snapshot, capped at 3 s) so built-in defaults never flash before the real content.
- Geo-priced HTML routes use `Cache-Control: private, no-store` per `AGENTS.md`.

### Tier 2 — App shell (first paint after hydration)

Shared chrome that depends on **client Firebase** or **async settings**:

| Source | Gate / seed |
|--------|-------------|
| Currency | `CurrencyService.ready()`; EGP-only copy hidden while pending (`html[data-cur-pending]`) |
| Auth | `AuthService.isAuthReady()` (browser only; account control) |
| Announcement bar (shipping slide) | `shippingSettingsResolver` → `shipping-settings`; `ShippingSettingsService.shellReady()` |
| Announcement bar (offer slides) | `bannerOffersResolver` → `banner-offers`; `BannerOffersService.shellReady()` (seed, first `OffersService` snapshot, or 2.5 s timeout) |
| Navigation | `navigationSettingsResolver` → `navigation-settings`; `catalogSettingsResolver` → `catalog-settings`; `NavService.shellReady()`; CSR `getDoc` before `onSnapshot` on both docs; desktop nav waits for `navLinksReady()` (nav + `CatalogService.shellReady()`) |

**Policy:** On **initial storefront load**, do not show shipping/nav-dependent chrome until **`ShellReadyService.chromeReady()`** is true. **`ready()`** also waits for auth in the browser. `MainLayoutComponent` uses a one-time `<app-loader>` overlay until `chromeReady()` (route changes keep the top pulse only). Focus-chrome routes (`data: FOCUS_CHROME`: `/login`, `/checkout`) show only the logo bar and skip that overlay, so a page there must handle its own loading (checkout waits for `CurrencyService.ready()`).

**SSR:** Seed settings the chrome shows via `getDoc` + `TransferState` so first HTML matches Egypt/EGP paths where applicable.

Subsequent in-app navigations: thin top progress only — do not re-block the whole page unless a child route resolver is blocking.

### Tier 3 — In-page async (skeleton, not gate)

Lists, grids, search hits: **`resource()` / `rxResource()`** loading states and **`<app-skeleton>`** — never render an empty list then pop in rows. Live updates after first ready state are fine (stock, offers).

---

## Feature checklist (run before shipping)

Answer: *“What does the user see in the first ~500ms if Firestore is slow?”* If **wrong data**, fix before PR.

| Question | If yes |
|----------|--------|
| Would **built-in defaults** mislead (nav, prices, shipping, labels)? | Do **not** render defaults while loading. SSR + `TransferState`, hydrate service **before** `onSnapshot`; or **hide** until ready + skeleton at same size. |
| On **every page** (layout chrome)? | Extend **`ShellReadyService.chromeReady()`** and/or add a **main-layout resolver** seed. |
| **Route-specific** (PDP, home hero)? | **Blocking resolver** + `TransferState`; 404/503 cache rules per `AGENTS.md`. |
| **List/grid** below the fold? | `resource()` / `rxResource()` + `<app-skeleton>`; never empty-then-rows. |
| Two fields can update **out of sync** (price vs EGP banner)? | One ready signal or SSR bundle; `data-cur-pending` for EGP-only copy while currency pending. |

---

## Banned patterns

- `return DEFAULT_X while doc === undefined` for **visible** storefront chrome.
- **`visibleStorefrontCategories` / nav links before `CatalogService.shellReady()`** — visitors must not see links that catalog counts will remove a frame later (`navLinksReady` gates desktop nav).
- **Card-shaped product skeletons before a known-empty category** — use `catalogListCount() === 0` for empty state; page-level `<app-loader>` while the list fetch runs, not `[loading]` on `app-catalog-product-grid`.
- **`app-loader` `minHeight` outside `LoaderHeight`** — only `'10'|'20'|…|'full'|'parent'` (`loader.model.ts`); preflight enforces this.
- `@if (text())` with no reserved height when text comes from async settings.
- Different template branches with **different sizes** for loading vs ready on the same control (e.g. account icon).
- Full-screen spinner over SSR hero/LCP on home or PDP.
- EGP shipping slide of the announcement bar while international currency is still pending.
- Global “wait for all Firestore listeners” before any paint.

---

## Reference implementations

| Piece | Location |
|-------|----------|
| Shell gate | `src/app/core/services/shell/shell-ready.service.ts` — `chromeReady()`, `ready()` |
| Main layout overlay | `MainLayoutComponent` — first-load `chromeReady()` |
| Home settings | `home-settings.resolver.ts`, `HOME_SETTINGS_KEY` (`home-settings`) |
| Shipping | `shipping-settings.resolver.ts`, `SHIPPING_SETTINGS_KEY` (`shipping-settings`) |
| Banner offers | `banner-offers.resolver.ts`, `BANNER_OFFERS_KEY` (`banner-offers`), `BannerOffersService` |
| Navigation | `navigation-settings.resolver.ts`, `NAVIGATION_SETTINGS_KEY` (`navigation-settings`) |
| Catalog counts | `catalog-settings.resolver.ts`, `CATALOG_SETTINGS_KEY` (`catalog-settings`) |
| Currency SSR | `serverCurrencyResolver`, `CurrencyService.prepareForServerRender()`, `CURRENCY_BOOT_KEY` (`currency-boot`) |
| Product page | `product-page.resolver.ts`, `makeStateKey(\`product-page:${slug}\`)` |

Services that listen after SSR must **hydrate from `TransferState` before attaching** `onSnapshot` so the first client frame does not revert to bundled defaults.

---

## Explicit non-goals

- No duplicate policy text elsewhere — **`AGENTS.md`** keeps a short pointer; **`preflight-gate`** and **`new-feature`** link here for the full checklist.
