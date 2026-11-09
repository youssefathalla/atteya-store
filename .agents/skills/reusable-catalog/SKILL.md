---
name: reusable-catalog
description: Living catalog and index of all reusable Shared UI components, extracted Tailwind CSS classes, core services, directives, and pipes in Atteya Store. Check this skill FIRST before writing any new component, directive, service, or CSS class to eliminate duplication and enforce the 2+ Duplication Rule.
---

# 📚 Reusable Components, Classes & Logic Catalog

This skill is the **Single Source of Truth** for reusable assets across Atteya Store.
**Golden Rule**: Never hand-roll a UI control, utility chain, or service without checking this catalog first.

---

## 🗂️ Table of Contents

1. [Shared UI Components (`src/app/shared/ui/`)](#1-shared-ui-components)
2. [Extracted Tailwind Classes (`src/styles/tailwind/components/`)](#2-extracted-tailwind-classes)
3. [Core Shared Services (`src/app/core/services/`)](#3-core-shared-services)
4. [Shared Directives & Pipes (`src/app/shared/`)](#4-shared-directives--pipes)
5. [Shared Schemas & Firebase Utilities (`src/app/shared/`)](#5-shared-schemas--firebase-utilities)
6. [Shared Logic & Breakpoint Utilities (`src/app/shared/utils/`)](#6-shared-logic--breakpoint-utilities)
7. [Image Optimization & Delivery System (ImageKit + Firebase + Cloud Functions)](#7-image-optimization--delivery-system-imagekit--firebase--cloud-functions)
8. [The "2+ Duplication Rule" Protocol](#8-the-2-duplication-rule-protocol)
9. [Homepage category list](#9-homepage-category-list)

---

## 1. Shared UI Components

Located in `src/app/shared/ui/`. Import them via `@shared/ui/...`.

### 📋 Form Controls (`src/app/shared/ui/forms/`)

All controls integrate seamlessly with **Angular 22 Signal Forms**.

- **Usage**: Bind `[formField]="form.field"` and `label="Label"`. Errors render automatically.
- **Controls**:
  - `<app-text-input>`: Single-line input with prefix/suffix icon support.
  - `<app-text-field-input>`: Multi-line textarea control.
  - `<app-password-input>`: Password input with built-in visibility toggle.
  - `<app-select-input [options]="options">`: Accessible select dropdown.
  - `<app-date-input>`: Material Datepicker input.
  - `<app-location-input>`: Location search and autocomplete input.
  - `<app-file-input>`: Drag-and-drop file uploader with size validation.
  - `<app-timepicker>`: Time selection control.

### 📊 Data Tables (`src/app/shared/ui/reusable-table/`)

- **Selector**: `<app-reusable-table [data]="data" [columns]="columns" />`
- **Inputs**:
  - `[data]`: Array of row items `T[]`.
  - `[columns]`: `TableColumn<T>[]` configuration array.
  - `[paginationService]`: Provide for server-side pagination (implements `PaginationServiceInterface<T>`).
  - ❌ Never pass `[pagination]` (the input is `paginationService`).

### 🏷️ Status Badges & Chips

- **Status Badge** (`src/app/shared/ui/status-badge/`):
  - `<app-status-badge [value]="status" [statusConfig]="config" />`
  - Values are lowercased internally. Config keys must be lowercase (`active`, `pending`, `danger`).
- **Filter Chips** (`src/app/shared/ui/chips/`):
  - `<app-chips [chips]="categories" [(value)]="selectedCategory" ariaLabel="Filter categories" />`
  - `[(value)]` is a two-way signal model. ❌ `[selected]` does not exist.
- **Colour swatch** (`src/app/shared/ui/color-swatch/`):
  - `<app-color-swatch class="size-3" [colorId]="'multi'" />` or `[colorId]="id" [swatch]="hex"`.
  - Solid palette colours use `--swatch`; `multi` renders the four-pane chip (yellow / red / blue / pink). Pass `round` for circular PDP buttons. Caller sets **size only** — never `block` / `inline-block` (they override the grid and hide Multi panes).

### 🃏 Cards & Layout Containers (`src/app/shared/ui/cards/`)

- `<app-base-card>`: Elevated surface container with hover glow and slots: `card-header`, `card-content`, `card-sub-content`, `card-actions`.
- `<app-info-card [title]="..." [value]="..." [icon]="...">`: Metric & KPI statistics card.
- `<app-review-card [review]="review">`: Testimonial and customer rating card.

### 💬 Dialogs & Modals (`src/app/shared/ui/dialogs/`)

- `<app-base-dialog>`: Foundation shell for dialog titles, content, and action buttons.
- `<app-confirm-dialog>`: Ready-to-use confirmation dialog (Delete, Cancel, Proceed).
- `<app-favorites-sign-in-dialog>`: Guest heart prompt (Cancel / Create account / Sign in). Opened by `FavoritesGateService`.
- `<app-img-preview-dialog>`: Lightbox image preview modal.

### 💎 Brand, Loaders & Media Editors

- `<mat-icon name="home" />`: Always import `SharedIconModule` from `@shared/ui/mat-icon`.
- `<app-logo [size]="'sm' | 'md' | 'lg'" />`: App branding logo SVG.
- `<app-loader>`: Standardized loading spinner overlay for blocking actions/overlays.
- `<app-payment-mark [method]="'instapay' | 'paymob' | 'cash-on-delivery'" size="md | lg" alone />` (`src/app/shared/ui/payment-mark/`): The mark of one payment method, so the bag, checkout and the order confirmation page match: the InstaPay logo in its brand colours (`public/img/payments/instapay.png`, a plain `<img>` with a fixed `src` like `app-logo`, never ImageKit), card + wallet icons for Card or Wallet, a cash icon for Cash on Delivery (black, from our icon font). `md` (default) is text height (logo 20px, icons `xl`); `lg` is the bag tiles (logo 44px). Next to the name it is `aria-hidden`; `alone` makes it carry the name (alt text / `role="img"`). Names and marks live in `PAYMENT_METHODS` (`payment-method.model.ts`, with `PaymentMethodId` = `CheckoutPaymentMethod` and `isPaymentMethodId()` for older order values): add a new method there; a logo method also needs its file and a `@case` in the component.
- `<app-skeleton [overlay]="false" />` (`src/app/shared/ui/skeleton/`): Reusable light-mode M3 shimmer placeholder (`aspect-4/5`, `aspect-16/9`, `aspect-square`, etc.) & overlay veil. When `overlay` is present (`<app-skeleton overlay />`), becomes an `absolute inset-0 size-full z-50 bg-surface` veil that covers buttons and text underneath so nothing shows through or can be clicked while loading.
- `<app-image-picker folder="hero" [asset]="asset()" (assetChange)="..." (uploaded)="..." />` (`src/app/shared/ui/image-picker/`): Single-image uploader + web URL importer + alt text field + live preview. Alt text is required unless `[altOptional]="true"` (decorative photos, such as the homepage category list). `[aspectClass]` sets the preview frame (`aspect-4/5` for that list). Folder `categories` is allowed.
- `<app-image-gallery-editor [folder]="'products/' + productId" [images]="images()" [defaultAlt]="name" (imagesChange)="..." (uploaded)="..." />` (`src/app/shared/ui/image-gallery-editor/`): Multi-image gallery editor (up to 8 images, CDK drag-drop reorder, index 0 badged as "Main Image", required per-image alt text). `[defaultAlt]` is the alt text for a photo added from a link (spaces collapsed, 125 characters), or "Product image" when it is empty. Uploaded files still use the file name.

---

## 2. Extracted Tailwind Classes

Located in `src/styles/tailwind/components/`. Use these classes directly in your templates.

| File                  | Reusable Classes                   | Description                                                                                                                                                                                                                                          |
| :-------------------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product-card.css`    | `.product-card`, `.product-card__*` | On.com-style listing card chrome (4:5 media, colour thumbs, black marketing badge)                                                                                                                                                                    |
| `home-product-rows.css` | `.home-section-title`, `.home-section-title-link`, `.padel-tile`, `.padel-tile__*`, `.home-new-arrivals .product-card__*` | Home section heading type (Shop tiles, Padel, New Arrivals); `.home-section-title-link` makes the heading a link, and `.home-section-title-arrow` adds a round outlined `arrow_outward` after it that shows on hover or keyboard focus (always on screens without hover) (New Arrivals → `/shop?newArrivals=1` when the row has marked new arrivals, otherwise `/shop?sort=newest`, Padel → `/category/rackets`, Shop → `/shop`; plain text in the admin preview); homepage padel floating tiles; New Arrivals 4:5 media with tightened section padding + viewport max-height, or `--row-lock-media-max` from `RowScrollLockDirective` on desktop (AS-73 / AS-83) |
| `shop.css`            | `.shop-product-grid`, `.shop-browse-layout`, `.shop-filters-scroll`, `.shop-filters-aside` (`--enter` / `--leave`), `.shop-filters-*`, `.shop-size-*`, `.shop-color-*`, `.shop-color-tick`, `.shop-color-swatch` | AS-74/AS-90 shop listing: dense 2/3-col grid (~2px gaps); sticky filter aside that slides/fades in and out through `animate.enter` / `animate.leave` (no animation with reduced motion), pinned 1.5rem below the sticky 56px desktop nav (only the gap on 768–1023px, where its height also stops above the phone bottom bar; not `--storefront-top-chrome`, whose shipping banner scrolls away), with its own scroll when the filters are taller than the window; `.shop-filters-scroll` (thin outline scrollbar, stable gutter) on the aside and the phone drawer body; ~56px size boxes three per row; colour rows on fixed swatch / name / tick columns |
| `product-page.css`    | `.pdp-gallery-track`, `.pdp-gallery-slide`, `.pdp-kicker`, `.pdp-choice`, `.pdp-size-toggle`, `.pdp-colour-thumb`, `.pdp-description`, `.pdp-section*`, `.pdp-gift-box`, `.pdp-gift-box__header`, `.pdp-gift-step`, `.pdp-gift-card`, `.pdp-gift-row`, `.pdp-gift-progress`, `.pdp-gift-tile` (photo tiles in the bag's free pick) | Product page: native scroll-snap photo row (1 per view, 2 from `xl`, lone photo fills the column; details beside the photos from `lg`, phones and tablets stack; each photo frame stops at the window height so the arrows stay in view; `--dragging` turns snapping off during a mouse drag), mono caps breadcrumb/badge line, option boxes (`aria-pressed` = selected, `--sold-out`), "Select a Size" opener, other-colour photo links (`aria-current` underline), description under the price (`.pdp-description`, paragraph spacing for `[innerHTML]`), open/close `<details>` rows (`.pdp-section__icon` + turns into × as it opens; the content slides open in about 200 ms through `::details-content` + `interpolate-size` inside `@supports`, so other browsers open at once; reduced motion opens at once; `.pdp-section__list` = one line per fact), Gift Box (`.pdp-gift-box` bordered box, `__header` black bar, `.pdp-gift-step` one numbered step, `--prompt` red line on the step Add to Bag asks for; gift choices are big cards `.pdp-gift-card` in one sideways row `.pdp-gift-row` (`__photo` 4:5, `__label` one short line; `aria-pressed` = 1px black border + black caption with ✓; `.pdp-gift-progress` thin line, `.pdp-gift-nav` arrows in the title row), sizes reuse `.pdp-choice`, which drops its colour transition under reduced motion) |
| `footer.css`          | `.footer-heading`, `.footer-link`, `.footer-social` | Storefront footer: bold caps column titles, quiet text links (also on native `<button>`s such as Sign Out), square bordered icon links holding a 20px inline brand SVG |
| `navigation.css`      | `.nav-column-title`                | Uppercase category/column headers with bottom border                                                                                                                                                                                                 |
|                       | `.nav-list`                        | Homepage category-list rows. Bordered full-width stack below `lg`; content-width from `lg` up                                                                                                                                                      |
|                       | `.nav-list-link`                   | Category link or preview button. Full-width row below `lg` (arrow at the row end). From `lg` up the link is only as wide as its label, and the arrow sits directly after the words (every row keeps its `.nav-list-arrow`, a 4xl weight 700 `arrow_right_alt`, so the list width never changes; only the active one shows) |
|                       | `.nav-list-panel`                  | 4:5 photo column (max 520px). `hidden` below `lg`. The image itself is not rendered until the browser confirms the desktop layout                                                                                   |
|                       | `.nav-menu-link`                   | Interactive nav item link with hover state and transitions                                                                                                                                                                                           |
|                       | `.nav-badge`                       | Small badge indicator for menu links                                                                                                                                                                                                                 |
|                       | `.nav-category-tab`                | Top-level category tab button in navigation bar                                                                                                                                                                                                      |
|                       | `.drag-handle-wrapper`             | Drag handles for re-ordering items in admin dashboards                                                                                                                                                                                               |
|                       | `.nav-admin-card`                  | Styled card for admin navigation items                                                                                                                                                                                                               |
| `status.css`          | `.status-badge`                    | Badge background, padding, and text formatting                                                                                                                                                                                                       |
|                       | `.toggle-pill`                     | Pick-many button (product form Colours and Players, offer conditions); selected look comes from `aria-pressed="true"`, so bind only `[attr.aria-pressed]` |
|                       | `.chip`                            | Rounded interactive filter chip                                                                                                                                                                                                                      |
|                       | `.chip-icon-wrapper`               | Icon container inside filter chips                                                                                                                                                                                                                   |
|                       | `.vehicle-status`                  | Card container with outline-variant border and padding                                                                                                                                                                                               |
| `color-swatch.css`    | `.color-swatch`, `.color-swatch--multi`, `.color-swatch--round`, `.color-swatch__pane*` | Closed-palette colour chip. Solid `--swatch` fill, or four-pane Multi (yellow/red/blue/pink). Used by `<app-color-swatch>`. |
| `spacing.css`         | `.container-content`               | Unified page section container (`flex flex-col flex-1 p-[5cqw] w-full` querying `<main class="@container">`). Never combine with `.section-space` or `@container` on the same element |
|                       | `.hero-space`                      | Standard hero section spacing                                                                                                                                                                                                                        |
|                       | `.section-space`                   | Standalone vertical spacing (`py-[5cqw]`) when horizontal padding is not needed                                                                                                                                                                      |
| `images.css`          | `.image-mask`                      | Image clipping and gradient mask                                                                                                                                                                                                                     |
|                       | `.hero-image`                      | Full-width responsive hero image container                                                                                                                                                                                                           |
| `scroll-row.css`      | `.scroll-row` + `.scroll-row-item`, `.row-scroll-nav*` | Horizontal snap-scroll row with "card peek". Native scrollbar chrome is hidden (swipe/drag kept); homepage rows and the bag's Recommended for You use `app-row-scroll-nav` (arrows + thin progress, `.row-scroll-nav`, `.row-scroll-nav__progress`, `.row-scroll-nav__progress-fill`) instead. The arrows get a 2px primary strong focus ring from `_buttons.scss` (`.row-scroll-nav` → `mat.strong-focus-indicators`). Tune via `--scroll-cols`, `--scroll-peek` (`0px` when all cards fit), `--scroll-gap`; make responsive with Tailwind, e.g. `scroll-row md:[--scroll-cols:2] xl:[--scroll-cols:3] xl:[--scroll-peek:0px]` |
| `skeleton.css`        | `.skeleton`                        | Light-mode M3 shimmer surface (`surface-container-high` to `surface-container-lowest`, `border-shape`, reduced-motion safe)                                                                                                                          |
|                       | `.skeleton-overlay`                | Full-bleed card overlay veil (`absolute inset-0 size-full z-50 bg-surface`)                                                                                                                                                                          |
| `payment-methods.css` | `.pay-option`, `.pay-option--selected`, `.pay-option--soon`, `.pay-option__mark`, `.pay-steps` | Checkout payment options: one bordered row per method (`mat-radio-button` inside), the chosen row a 2px black border (border + inset ring, no shift), a method not offered yet dashed; `.pay-option__mark` is the ~56×40 box that holds `app-payment-mark` before the name; `.pay-steps` is the `<ol>` of short steps under the chosen method (14px text, each number from a CSS counter in a small black circle; wrap a step holding `<strong>` in one `<span>` so it stays one line of text) |
| `order-confirmation.css` | `.order-band`, `.order-money`, `.order-money__box`, `.order-money__box--now`, `.order-step`, `.order-step__rail`, `.order-step__dot` (`--done` / `--current` / `--stopped`), `.order-step__line` (`--done`), `.order-step__body`, `.order-pay-card`, `.order-thumb`, `.order-thumb__qty`, `.order-whatsapp-mark` | Order confirmation page (design C): black status band with the money boxes (the "Pay now" box white), the "What happens next" steps (dot + line rail, text beside it), the InstaPay box inside the current step (on a narrow page it reaches back under the dots), product photo with the quantity badge, and the green WhatsApp mark after "Questions? Message us". Steps per order stage come from `confirmationSteps()` (`features/checkout/utils/confirmation-steps.ts`) |
| `overlays.css`        | `.loading-overlay`                 | Full-screen semi-transparent loading backdrop                                                                                                                                                                                                        |
|                       | `.badge-overlay`                   | Absolute-positioned badge over an image or card                                                                                                                                                                                                      |
|                       | `.icon-overlay`                    | Absolute-positioned icon container over an image or card                                                                                                                                                                                             |
| `components-base.css` | `.base-card`                       | Base border, rounded corner, and surface container styling                                                                                                                                                                                           |
|                       | `.form-card`                       | Styled container for forms and inputs                                                                                                                                                                                                                |
|                       | `.bg-circle`                       | Circular icon / avatar wrapper container                                                                                                                                                                                                             |
|                       | `.panel-border`                    | United border framing (`border border-outline-variant border-shape`)                                                                                                                                                                                 |
|                       | `.surface-card`                    | Unified card shell (`bg-surface-container-lowest panel-border shadow-sm`)                                                                                                                                                                            |

### 📐 Layout & Alignment Shortcuts (`src/styles/tailwind/utilities/layout.css`)

| Utility Class          | Expansion                                    | Usage                                                 |
| :--------------------- | :------------------------------------------- | :---------------------------------------------------- |
| `elements-center`      | `flex flex-row justify-center items-center`  | Centered flex containers, icon badges, dialog centers |
| `elements-start`       | `flex flex-row justify-start items-center`   | Left-aligned flex row with centered vertical items    |
| `elements-end`         | `flex flex-row justify-end items-center`     | Right-aligned flex row with centered vertical items   |
| `elements-between`     | `flex flex-row justify-between items-center` | Space-between headers, navbars, rows with actions     |
| `elements-center-col`  | `flex flex-col justify-center items-center`  | Centered column stack, mobile modal bodies            |
| `elements-start-col`   | `flex flex-col justify-center items-start`   | Left-aligned column stack, vertical header titles     |
| `elements-end-col`     | `flex flex-col justify-center items-end`     | Right-aligned column stack                            |
| `elements-between-col` | `flex flex-col justify-between items-center` | Space-between vertical cards/sidebars                 |
| `form-space`           | `flex flex-col gap-4 pt-4`                   | Standard form field vertical spacing                  |

### 🔲 Borders & United Shape (`src/styles/tailwind/utilities/borders.css`)

| Utility Class  | Expansion                                 | Usage                                                                                             |
| :------------- | :---------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `border-shape` | `border-radius: var(--border-shape, 2px)` | **Single source of truth** for corner radius/shape across all cards, panels, containers, and rows |

### 📱 Safe Area Utilities (`src/styles/tailwind/utilities/safe-area.css`)

| Utility Class    | Expansion                                                           | Usage                                                                 |
| :--------------- | :------------------------------------------------------------------ | :-------------------------------------------------------------------- |
| `pb-safe-bottom` | `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.375rem)` | Fixed bottom navigation bar padding for iPhone/Android home indicator |
| `pb-safe-drawer` | `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 4.5rem)`   | Fullscreen slide-up drawer padding to prevent overlapping bottom nav  |
| `pt-safe-top`    | `padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem)`        | Modal and drawer top padding clearing status bar notch                |

### 🪟 Drag & Drop Utilities (`src/styles/ng-material/components/_drag-drop.scss`)

| Utility / Class        | Description                                                             | Usage                                                                                                 |
| :--------------------- | :---------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| `.drag-handle-wrapper` | Cursor grab/grabbing, element center, hover effect for CDK drag handles | `<span cdkDragHandle class="drag-handle-wrapper"><mat-icon name="drag_indicator" size="lg" /></span>` |

## 3. Core Shared Services

Located in `src/app/core/services/` or layout services. Inject them using `inject(ServiceName)`:

- **`DrawerService`** (`src/app/core/services/drawer/drawer.service.ts`):
  - `activeDrawer()`: Signal representing current open drawer (`'cart'`, `'menu'`, or `null`).
  - `open(name)`: Opens specified drawer.
  - `close()`: Closes any active drawer.
  - `toggle(name)`: Toggles drawer state.
  - While the bag (`'cart'`) is open the page behind is locked with the CDK block scroll strategy (`createBlockScrollStrategy`, the same lock CDK Dialog gives the search and account panels); closing puts the page back where it was. The lock is set in the same call as the signal, so a panel opened right after (search closes the drawer first) never finds the page still locked. It calls `OverlayContainer.getContainerElement()` first because `.cdk-global-scrollblock` ships with the lazily loaded CDK overlay styles. The bag's item list (`app-cart-drawer`) is the only scrolling part, with `overscroll-contain`; the header and the Subtotal / Checkout footer stay in place. The menu drawer does not lock the page.
- **`SnackbarService`** (`src/app/core/services/snack-bar/snack-bar.service.ts`):
  - `show(msg, theme)`: Triggers M3 status snackbar.
  - Helper methods: `success(msg)`, `error(msg)`, `warning(msg)`, `info(msg)`.
- **`ThemeService`** (`src/app/core/services/theme/theme.service.ts`):
  - `isDark()`: Signal returning boolean dark mode state.
  - `toggleTheme()`: Toggles dark / light theme.
- **`LoadingService`** (`src/app/core/services/loading/loading.service.ts`):
  - `isLoading`: Computed signal indicating whether any task is running.
  - `setLoading(key)`: Registers a key as active loading.
  - `stopLoading(key)`: Unregisters a loading key.
- **`SeoService`** (`src/app/core/services/seo/seo.service.ts`):
  - `setPageMetadata(config)`: Sets title, meta description, and robots tags.
  - `setTitle(title)` / `updateTag(tag)`.
- **`AuthService`** (`src/app/core/services/auth/auth.service.ts`):
  - SSR-safe. Firebase Auth runs in the browser only. On the server, `user` is `null` and `role` is `'anon'`.
  - `user`: `Signal<User | null>`, set only after the ID token role is known.
  - `isAuthReady`, `isAuthenticated`, `role` (`'anon' | 'user' | 'admin'`), `isAdmin`.
  - `login(email, password)`, `loginWithGoogle()` (popup, then redirect if the popup is blocked), `linkPendingGoogle(email, password)` for `auth/account-exists-with-different-credential`, `logout()`, `sendPasswordReset(email)`, `refreshRole(force?)`, `redirectIfNoLongerAdmin(returnUrl)`, `watchAdminAccess()`.
  - Browser `Auth` is `initializeAuth` without `popupRedirectResolver` (indexedDB, then local storage). Popup, redirect, and `getRedirectResult` pass `browserPopupRedirectResolver`. `getRedirectResult` runs only after `signInWithRedirect` set `sessionStorage` `atteya-auth-redirect`, or on `/login`. Other pages do not load `__/auth/iframe.js`.
  - A token change during `refreshRole` is applied when that refresh settles. Sign-out clears `user` and sets `role` to `'anon'` immediately.
  - `redirectIfNoLongerAdmin` sends a signed-in non-admin home with `NOT_ADMIN_MESSAGE`. `watchAdminAccess()` (called from the admin layout) does the same if admin access disappears while `/admin` is open, and sends a signed-out person to `/login`.
  - No self sign-up. Do not call `createUserWithEmailAndPassword`.
  - While signed in, an `rxResource` listens to `roles/{uid}` and calls `getIdToken(true)` when the mirror role differs from the token.
  - `adminGuard` (`src/app/core/guards/admin/admin.guard.ts`) is `canActivate` and `canActivateChild` on the admin layout. It force-refreshes the claim on entry from outside `/admin`. Visitors go to `/login`. Signed-in non-admins go home with `NOT_ADMIN_MESSAGE` (`src/app/features/auth/utils/login-exit.ts`).
  - `/login` is `features/auth/login`. The navbar account menu is `app-account-menu`. The server and the first browser render both show a disabled placeholder. Sign in or the account actions appear only after `isAuthReady()` in the browser, so prerendered HTML hydrates cleanly.
- **`NavService`** (`src/app/core/services/navigation/nav.service.ts`):
  - Main layout SSR: `navigationSettingsResolver` reads `settings/navigation` once and seeds TransferState (`navigation-settings`); the browser hydrates before `onSnapshot`, then the live doc replaces it. CSR-only first loads (`ng serve`, empty shell) run the same `getDoc` once **before** attaching `onSnapshot`, then keep the listener for live edits. Bundled `NAV_CATEGORIES` apply only when the doc is missing or has no categories — not while loading when a seed or getDoc result exists.
  - `categories`: Computed signal for the saved navigation catalog, with the bundled fallback when unseeded. The Navigation manager and category pages keep this unfiltered list.
  - `storefrontCategories`: The same list with empty known categories and brands removed once `settings/catalog` has counts. Desktop nav, the mobile menu, and the brands directory read this. Unknown placeholders (sale, best-sellers, shape filters) stay, so the built-in `NAV_CATEGORIES` (`nav.data.ts`) link only to pages that exist today: the shop routes (`/shop`, `/category/rackets|apparel|accessories`, `/category/accessories/bags`, optionally with a shop filter the page reads such as `?onSale=1`), published category pages (`/category/<id>`), published brand pages (`/brand/<id>`), and `/brands`. Never add merchandising paths (`…/new`, `…/best-sellers`, `…/pro`), unpublished placeholders (`hoodies`, `tracksuits`, `bundles`, `puma`), or query filters the page ignores (`?type=`, `?shape=`, `?cat=`). Templates bind every saved link through `\| linkTarget`.
  - `shellReady` / `isLoading` / `navLinksReady`: First doc value (SSR seed, CSR getDoc, or snapshot) plus `CatalogService.shellReady()` so empty-category trimming does not flash every link before counts arrive; desktop nav skeleton until `navLinksReady`.
  - `updateNavigation(categories)`, `seedDefaultNavigation()`.
- **`ProductCacheService`** (`src/app/core/services/products/product-cache.service.ts`):
  - Browser-only in-memory cache of published products, keyed by slug. 60 seconds, 50 entries, dropped on reload. Failed reads are not stored. `null` (not found) is stored for the same 60 seconds.
  - The server never reads or writes it. `getBySlug(slug)` shares an in-flight read. `prefetch(slug)` is fire-and-forget and skips Save-Data, 2G, an empty slug, and a slug longer than 200 characters. `seed(products)` stores docs a page already loaded (`published === true` only). `clear()` drops every entry after an admin product save or a successful stock save in the same tab.
  - The product resolver uses it on the client only, after the TransferState hand-off, so hydration does not read twice. Search cards and colour siblings prefetch through `appPrefetchProduct`. Siblings call `seed()` with `listModelGroup`. Paint only; the product page's live doc listener is the source of truth for price and stock.
- **`ProductService`** (`src/app/core/services/products/product.service.ts`):
  - Public catalogue reads. Every query includes `where('published', '==', true)`.
  - `listPublished({ category?, type?, brand?, limit })`: newest first. Pass at most one of category, type, or brand.
  - `listNewArrivals(max = NEW_ARRIVALS_LIMIT)` (home row, 6 products): unexpired `newArrivalUntil` first (most recently updated), then newest by `createdAt`, de-duped. Helpers in `utils/new-arrival.ts` (Angular) / `functions/src/products/new-arrival.ts`.
  - `getBySlug(slug)`, `getById(id)` (permission-denied on an unpublished product returns `null`), `listModelGroup(modelGroup, excludeId, max = 8)`, `countPublished(query)`.
  - Taxonomy constants live in `product.constants.ts` and must stay aligned with `functions/src/products/catalog-mapping.ts`.
- **`PlayerListService`** (`src/app/core/services/products/player-list.service.ts`, <KEY>-79): the `settings/players` list (`players: [{ id, name }]`) read once per visit with `getDoc` in a `resource` (`id: 'player-list'`, so the server read reaches the browser). `players()` (saved order, empty while loading or on error), `namesById()`, `nameOf(id)`, `hasValue()`, `reload()` (after Settings → Players saves). Schema and helpers in `player.schema.ts`: `PlayerSchema`, `PlayerIdSchema`, `parsePlayerList()` (drops bad or repeated entries), `playerIdFromName()` ("Ale Galán" → `ale-galan`), `isPlayerId()`, `MAX_PRODUCT_PLAYERS` (10). Functions copy of the limits and parsers: `functions/src/products/players.ts`.
- **`CatalogService`** (`src/app/core/services/products/catalog.service.ts`):
  - `summary` / `counts`: parsed `settings/catalog`, or `null` while loading, missing, or not yet a full summary.
  - `visibleTypes`, `visibleBrands`: types and brands with a published count. All of them while the summary is unknown.
  - `isEmpty(path)`: `false` until a summary exists, then `true` for a known empty category, type, or brand path.
- **`isOnSale` / `discountPercent`** (`src/app/core/services/products/utils/product-price.utils.ts`): whole-pound sale helpers. Do not use these for the legacy GBP pence pipe.
- **`CurrencyService`** (`src/app/core/services/currency/currency.service.ts`):
  - `selected()`, `entry()` (`CurrencyEntry`, starts as `EGP_ENTRY`), `ready()`.
  - No switcher and no saved currency. `?cur=` applies for one visit, then the query is removed.
  - **Geo, not timezone:** CDN/platform headers and optional IP lookup (`visitor-geo.ts`) pick ISO country; `currencyFromCountry()` maps country → currency (`country-currency.ts`, CLDR). Egypt stays EGP. SSR `prepareForServerRender()` loads factors and renders converted prices when possible; boot crosses `TransferState` (`currency-boot`). Client-only routes call `/api/visitor-location`.
  - `toDisplayAmount` and `displayDecimals` live in the shared pricing engine (`functions/src/offers/engine/currency.ts`).
- **`ImageSourceService`** (`src/app/core/services/storage/image-source.service.ts`):
  - **Primary entry point for admin image uploads & URL resolution.**
  - `uploadFile(file, folder)`: Validates format (JPG/PNG/WebP/AVIF, max 10MB, no SVG), reads local dimensions, uploads to Storage, and probes ImageKit delivery.
  - `resolveInput(raw, folder)`: Parses user input (`parseImageInput`). A managed path already in `folder` is kept after an ImageKit reachability check. A managed path outside that folder, and an external URL, go through `importImageFromUrl` (copy or fetch). Width and height are the natural size, never the 64px probe. Throws plain-language `ImageInputError`, including `NOT_ALLOWED` when Storage or the callable rejects the caller, and `NOT_FOUND` when the file is missing.
- **`StorageUploadService`** (`src/app/core/services/storage/storage-upload.service.ts`):
  - Loads `firebase/storage` and `firebase/functions` when an upload, import, or delete runs (`injectStorageAsync` / `injectFunctionsAsync` return a loader, invoked on each use, region `europe-west3`). A failed chunk load can be retried. They are not in the initial bundle.
  - `uploadImage(file, folder = 'hero')`: Uploads image (`File`) to Firebase Storage via `uploadBytes()`, returning `{ path: string }` (does not call `getDownloadURL()`).
  - `importFromUrl(url, folder = 'hero')`: Calls the `importImageFromUrl` 2nd-gen Callable Cloud Function (`functions/src/import-image.fn.ts`) and returns its path. There is no browser fetch fallback. The function is admin-only, https on port 443, at most 3 re-checked redirects, a 10 second deadline, a 10 MB streamed cap, and magic-byte checks for JPEG, PNG, WebP, and AVIF. Deploys build `functions/` first via the `firebase.json` predeploy.
  - `copyStoredImage(path, folder)`: Calls the same `importImageFromUrl` callable with `{ path, folder }` so the server copies one of our own files into that folder. A path already inside the folder is not sent here.
  - `deleteImage(pathOrUrl)` / `deleteImages(paths)`: Deletes managed Storage files while ignoring `/img/`, external URLs, or `PROTECTED_STORAGE_PATHS`.
  - `isUploading`: Read-only `Signal<boolean>` tracking active upload status.
- **`StorageAssetTracker`** (`src/app/core/services/storage/storage-asset-tracker.ts`):
  - Per-draft session upload tracker (instantiated per feature draft service, e.g. `new StorageAssetTracker()`).
  - Methods: `register(path)`, `clear()`, `orphansOnPublish(previousLive, kept)`, `orphansOnDiscard(live)`, `orphansOnReset(live)`.

---

## 4. Shared Directives & Pipes

- **`PrefetchProductDirective`** (`src/app/shared/directives/prefetch-product`):
  - Selector: `[appPrefetchProduct]="slug"` on a product link.
  - Mouse: prefetch after a 100 ms rest, or immediately on `pointerdown`. Wheel and pointer-move are passive listeners added after render (not host bindings). A wheel-scroll or a quick leave resets that rest. Touch: prefetch only if the finger stays within 8 px. Keyboard: `:focus-visible`, then the same 100 ms rest; `focusout` cancels it. No-op on Save-Data and 2G via `ProductCacheService.prefetch`.
- **`AppImageFallbackDirective`** (`src/app/shared/directives/image-fallback`):
  - Selector: `img[appImageFallback]` (bind `<img [ngSrc]="path" [appImageFallback]="path" ... />`).
  - Automatically displays a monochrome `.skeleton` shimmer while the image loads, and fails over once to `buildStorageUrl(path)` if ImageKit CDN fails or is still syncing.
- **`HorizontalScrollDirective`** (`src/app/shared/directives/horizontal-scroll`):
  - Enables smooth drag-to-scroll and mouse-wheel horizontal scrolling.
  - `<div appHorizontalScroll [snapToItems]="false" [wheelSpeed]="2.0" [dragSpeed]="1.5">`
  - The wheel is handed back to the page at the row's first and last item (it never traps page scrolling). `[enableWheel]="false"` leaves the wheel to the page entirely (home rows, bag). With drag on, native link/photo `dragstart` is cancelled so mouse drag works over cards.
  - Mouse drag turns CSS snapping and smooth scrolling off on the row while dragging (they made every move animate and jump back to a card), then glides to the nearest card on release (or the next one after a quick flick) and puts the row's previous inline `scroll-snap-type` / `scroll-behavior` back on `scrollend` (600 ms fallback). With `[snapToItems]="false"` it just puts them back.
  - `exportAs: 'horizontalScroll'`. `[trackScroll]="true"` keeps `progress()`, `canPrev()` and `canNext()` current (scroll listener + ResizeObserver + child MutationObserver, browser only; off by default so card swatch rows add no listeners); `step(±1)` moves one card (`scrollRowByItem`). Wiring without a scroll lock (bag): `<div class="scroll-row" appHorizontalScroll #row="horizontalScroll" [enableWheel]="false" [trackScroll]="true">…</div> @if (row.canPrev() || row.canNext()) { <app-row-scroll-nav [progress]="row.progress()" [canPrev]="row.canPrev()" [canNext]="row.canNext()" (prev)="row.step(-1)" (next)="row.step(1)" /> }`. Home rows keep their own sync in the section component because arrows go through `lock.step()`.
- **`RowScrollNavComponent`** (`app-row-scroll-nav`, `@shared/ui/row-scroll-nav`): ← / → icon buttons ("Previous" / "Next", disabled at each end) and a thin progress line (`role="progressbar"`). Inputs `progress` (0–1), `canPrev`, `canNext`; outputs `prev`, `next`. Show it only when the row can scroll. Row helpers `rowScrollProgress`, `rowItemTarget`, `scrollRowByItem` live in `@shared/utils/row-scroll.utils`. `[showProgress]="false"` (default true) hides the line when the page draws its own (the Gift Box).
- **`RowScrollLockDirective`** (`src/app/features/home/directives/row-scroll-lock.directive.ts`, home only):
  - `<div class="scroll-row" appHorizontalScroll appRowScrollLock #lock="rowScrollLock" [enableWheel]="false" [snapToItems]="!lock.enabled()">` inside the section's `<section>`; arrows call `lock.step(±1)`.
  - Desktop scroll lock for New Arrivals and Padel: GSAP ScrollTrigger scrub, sticky section + spacer in the component host. Details and limits in `AGENTS.md` → Storefront motion.
  - `rowLockFit=".product-card__media"` (optional, New Arrivals): a section taller than the window shrinks those photos so heading, cards and arrows fit below the nav while locked. The directive sets `--row-lock-media-max` (px) on the section; the section's CSS caps the photo height with it (`home-product-rows.css`).
- **`TemplateTypeDirective`** (`src/app/shared/directives/template-type`):
  - Provides type-safety for `ng-template` context variables.
- **`PenceToPoundsPipe`** (`src/app/shared/pipes/pence-to-pounds.pipe.ts`):
  - Legacy. Converts integer pence into formatted GBP currency strings. Do not use it for Egyptian pounds.
- **`EgpPricePipe`** (`src/app/shared/pipes/egp-price.pipe.ts`):
  - Name: `egpPrice`. Admin screens. Formats a whole Egyptian pound amount through `formatMoney` (`en-EG`, currency `EGP`, no fraction digits), for example `EGP 599`. Storefront prices use `app-product-price` instead.
- **`LinkTargetPipe`** (`src/app/shared/pipes/link-target.pipe.ts`):
  - Name: `linkTarget`. Use on every `[routerLink]` bound to a saved link string (navigation menus, home hero buttons, shop tiles, navigation list): `[routerLink]="link.path | linkTarget"`. A plain string `routerLink` treats `?` and `#` as part of the path (`/shop?onSale=1` opens `/shop%3FonSale%3D1`), so links with a query or fragment are parsed into a `UrlTree` with `Router.parseUrl`; other values pass through.
- **`TimestampDatePipe`** (`src/app/shared/pipes/`):
  - Formats Firestore `Timestamp` objects into localized date strings.

---

## 5. Shared Schemas & Firebase Utilities

Located in `src/app/shared/schemas/` and `src/app/shared/utils/firebase/`:

- **Image Schemas** (`src/app/shared/schemas/image.schema.ts`):
  - `ImageAssetSchema` / `ImageAsset`: `{ path: string; alt: string; width?: number; height?: number }` with required trimmed alt text (max 125 chars).
  - `ImageGallerySchema` / `ImageGallery`: `ImageAsset[]` capped at `IMAGE_LIMITS.maxGallerySize` (8 images, index 0 = Main image).
- **Common Schemas** (`src/app/shared/schemas/common.schema.ts`):
  - `idSchema` / `IdSchema`: Non-empty trimmed string ID validator.
  - `slugSchema` / `SlugSchema`: URL-safe slug validator.
  - `timestampSchema` / `TimestampSchema`: Firestore `Timestamp` / Date / ISO string parser.
  - `auditSchema` / `AuditSchema`: Created/updated timestamp tracking.
  - `emailSchema`: Validated email address parser with trim.
  - `phoneSchema`: International phone number format validator.
  - `passwordSchema`: Secure password validator with minimum length enforcement.
  - `futureDateSchema`: Date validator ensuring selection is today or in the future.
  - `timestampToDate`: Transform pipeline converting Firestore `Timestamp` to JavaScript `Date`.
- **Firestore Converters** (`src/app/shared/utils/firebase/firestore-converter.ts`):
  - `createValibotConverter(schema)`: Creates a strongly typed `FirestoreDataConverter<T>` powered by Valibot `v.parse()`, injecting document `id`. Reads with `serverTimestamps: 'estimate'` (unless the caller passes its own), so a `serverTimestamp()` written from this browser reaches `onSnapshot` as a local estimate instead of `null` and timestamp schemas never see `null` for it. Never write a date field as `null` to mean "not confirmed yet"; a schema allows `null` only when `null` is stored on purpose (`v.nullable(timestampSchema, null)`).
- **Firestore Signals** (`src/app/shared/utils/firebase/firestore-signals.ts`):
  - `signalDoc(docRef)`: Binds a Firestore document snapshot directly to an Angular Signal (SSR-safe, auto-unsubscribing).
  - `signalCollection(queryRef)`: Binds a Firestore query/collection to an Angular Signal (SSR-safe, auto-unsubscribing).
- **Error Handling & Retry** (`src/app/shared/utils/firebase/`):
  - `firebaseErrors(error)` / `mapFirebaseError` / `handleFirebaseError`: Translates Firebase Auth, Firestore, Storage, and Functions errors into user-friendly status messages.
  - `callableMessage(error)`: The plain message a callable's `HttpsError` carried, without the ` [400]`-style HTTP status the Functions SDK adds to every callable error. Returns null for non-callable errors and for the SDK's own status text (uncaught server error, network failure, timeout), so the caller shows its own fallback. Use it in every `catch` that shows a callable's message (checkout Place Order, `orderActionError`, `importActionError`); never show `error.message` from a callable directly.
  - `authRetryConfig` / `firestoreRetryConfig`: RxJS retry configurations for transient network failures.
  - `withRetry(operation, options)`: Retries idempotent async Promise operations with exponential backoff.

---

## 6. Shared Logic & Breakpoint Utilities

Located in `src/app/shared/utils/`:

- **`formatMoney`** (`src/app/shared/utils/money.ts`):
  - `formatMoney(amount, code, decimals)`. EGP uses the `en-EG` whole-pound formatter. Other currencies use `en-US` currency format with the published fraction digits. Formatters are cached.
- **`useBreakpoint`** (`src/app/shared/utils/breakpoint.utils.ts`):
  - Returns a reactive `Signal<boolean>` indicating whether the media query matches.
  - Automatically wraps Angular CDK `BreakpointObserver` in `toSignal()`.
  - Usage: `readonly isDesktop = useBreakpoint(1280);` or `useBreakpoint('(min-width: 1024px)')`.
- **`injectFirstRowCount`** (`src/app/shared/utils/first-row.utils.ts`):
  - How many cards fill a product grid's first row, so exactly that row gets `priority` photos: `readonly firstRow = injectFirstRowCount({ base: 2, md: 3, lg: 4 });` then `[priority]="i < firstRow"` on `app-product-card`. Pass the same counts as the grid's `grid-cols-*` classes (`md` = 768px, `lg` = 1024px).
  - The server always returns `base` (the phone row), so server HTML never holds more image preloads than a phone needs. The browser reads `matchMedia` once when the grid is created (never live: `NgOptimizedImage` throws if `priority` changes), so a wider screen's extra first-row photos switch to eager + high fetch priority on hydration (attributes only, no hydration mismatch).
  - Used by `app-catalog-product-grid` (2 / 3 / 4) and `app-shop-grid` (2 / 3, `.shop-product-grid`). Search keeps the phone row (`i < 2`) because the Browser Check shows no NG02955 note there.
- **`useStepperOrientation`** (`src/app/shared/utils/stepper-orientation.utils.ts`):
  - Returns a reactive `Signal<StepperOrientation>` (`'horizontal' | 'vertical'`) for Material Stepper components.
  - Usage: `readonly stepperOrientation = useStepperOrientation(800);`
- **Image Pipeline Utilities** (`src/app/shared/utils/image/` — re-exported via `@shared/utils/image` and `@shared/utils/image.utils`):
  - `IMAGE_LIMITS`, `IMAGE_FOLDERS`, `ImageFolderPath`, `PROTECTED_STORAGE_PATHS`.
  - `normalizeImageKitPath(urlOrPath)`: Normalizes managed Storage/ImageKit URLs (verifying `environment.firebase.storageBucket`) into relative paths for `NgOptimizedImage`. A leading ImageKit `tr:` segment is dropped, so a resized URL and the plain URL map to the same storage path.
  - `buildStorageUrl(pathOrUrl)`: Direct Google Cloud Storage URL (`https://storage.googleapis.com/<bucket>/<path>`) using the active environment bucket.
  - `buildImageKitUrl(pathOrUrl, tr?)`: Explicit ImageKit CDN URL for probes, `og:image`, and JSON-LD.
  - `parseImageInput(raw)`: Pure ReDoS-safe classifier returning `external-url`, `managed-path`, or `invalid`.
  - `diffOrphanedPaths(candidates, kept, protectedPaths?)`: Computes unreferenced Storage paths for cleanup.
  - `sanitizeAltFromFilename(filename)`: Pre-fills clean, human-readable alt text from filenames.

---

## 7. Image Optimization & Delivery System (ImageKit + Firebase + Cloud Functions)

All storefront visual media (hero banners, product showcases, category headers) are delivered through ImageKit CDN, while master assets are securely stored in Firebase Cloud Storage. ImageKit's web-folder origin and `buildStorageUrl()` both request `https://storage.googleapis.com/<bucket>/<path>`, which does not evaluate `firebase/storage.rules`. Category showcase images uploaded with `folder="categories"` therefore do not need a public Storage-rule read; `/hero` is the only public SDK read, and that rule is not what serves the storefront.

### 🌐 Dual Environment Endpoints

- **Development**: `https://ik.imagekit.io/atteyastore/dev/` (Origin: `atteya-store-dev.firebasestorage.app`)
- **Production**: `https://ik.imagekit.io/atteyastore/` (Origin: `attiya-store.firebasestorage.app`)
- Configured in `app.config.ts`: `provideImageKitLoader(environment.imageKitUrl)`.

### ⚡ Angular NgOptimizedImage + AppImageFallbackDirective Guidelines

- **Always use `NgOptimizedImage` (`[ngSrc]`) paired with `[appImageFallback]`**. Raw `<img [src]>` is strictly forbidden for media assets.
- **Hero / Above-The-Fold / LCP**:

  ```html
  @if (imagePath()) {
  <img
    [ngSrc]="imagePath()"
    [appImageFallback]="imagePath()"
    [alt]="item().imageAlt || item().headline"
    fill
    priority
    sizes="100vw"
    class="object-cover object-center"
  />
  }
  ```

- **Grid / Cards / Thumbnails**:

  ```html
  @if (imagePath()) {
  <img
    [ngSrc]="imagePath()"
    [appImageFallback]="imagePath()"
    [alt]="item().alt"
    fill
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    class="object-cover object-center"
  />
  }
  ```

### 📤 Image Uploads & Admin Pickers (`ImageSourceService` / `ImagePicker` / `ImageGalleryEditor`)

- In admin forms, use `<app-image-picker>` for single images or `<app-image-gallery-editor>` for multi-image galleries (up to 8 images, `products/<productId>/` folder).
- Track session uploads with `StorageAssetTracker` so discarded or replaced files are automatically cleaned up from Firebase Storage.

### Admin role

The custom claim `role: 'admin'` is the only admin grant. `AdminRolesService` (`src/app/features/admin/pages/settings/services/admin-roles.service.ts`) calls `listAdmins` and `setUserRole` and reads the latest 20 `auditLogs`. Settings sidebar entries are standalone pages under `/admin/settings/*` (Admins, Shipping, Outside Egypt, Bank transfer) with no shared in-page switcher; Admins is `/admin/settings/admins`. The repo copy of the bootstrap script is `functions/scripts/set-admin.mjs` (`--role`, `--show`, `--list`). `--list` scans Auth claims. `listAdmins` prefers the `roles` mirror index verified with Auth `getUsers` (full claim scan only when mirrors are empty or all stale, then heals mirrors). `setUserRole` refuses to remove the last admin, writes one audit record, revokes refresh tokens on removal, and stores Auth `tokensValidAfterTime` as `roles/{uid}.revokeTimeMs`. Firestore rules, Storage rules, and admin callables reject a session whose `auth_time` is older than that timestamp. A missing mirror or a missing `revokeTimeMs` does not block an admin. App Check enforcement stays off until `APP_CHECK_ENFORCED` is set.

---

## 8. The "2+ Duplication Rule" Protocol

Whenever you find a combination of 4 or more utility classes that is repeated **2 or more times**:

1. **Do NOT copy-paste the utility chain**.
2. **Select the destination file**:
   - Navigation: `src/styles/tailwind/components/navigation.css`
   - Spacing: `src/styles/tailwind/components/spacing.css`
   - Status & Badges: `src/styles/tailwind/components/status.css`
   - Cards & General: `src/styles/tailwind/components-base.css`
   - New domain: Create `src/styles/tailwind/components/[domain].css` and import it in `src/tailwind.css`.
3. **Extract using Tailwind v4 `@layer components`**:

   ```css
   @layer components {
     .custom-feature-card {
       @apply block w-full p-6 bg-surface-container-low border border-outline-variant border-shape shadow-mat-1 hover:border-primary transition-all duration-300;
     }
   }
   ```

4. **Use the new class** in your templates.
5. **Update this catalog** with the new class name.

---

## 9. Homepage category list

`NavigationListSectionComponent` (`app-navigation-list-section`, `src/app/features/home/components/navigation-list-section/`) is Section 3 on the storefront home page and the admin live preview.

- **Inputs**: `navList` (required `HomeNavList`), `isLoading`, `previewMode`, `activeItemIndex`.
- **Output**: `itemSelect` — emitted in preview mode instead of navigating.
- **Data**: optional `settings/home.navList`, then localStorage `atteya_store_home_nav_list`, then `DEFAULT_HOME_NAV_LIST`. `/` reads `settings/home` on the server (`homeSettingsResolver` → `TransferState` key `home-settings`) and the browser keeps the live `onSnapshot` in `HomeService`. The route is `private, no-store`.
- **Motion**: first storefront GSAP use. `import('gsap')` runs inside `afterNextRender`. Tweens live in a `gsap.context` scoped to the host and `revert()` on destroy. The server HTML marks the first link active. Once the desktop panel mounts, CSS shows that photo until GSAP runs. `prefers-reduced-motion` swaps with no scale. A change to a photo that has not downloaded yet keeps the current photo on screen (the incoming one held at opacity 0) and plays once that photo loads or finally fails (both URLs), or after 1.2 s at most (`pendingNavListImage()` in `features/home/utils/navigation-list-motion.ts`), so the swap never fades through an empty frame or pops the picture in afterwards. The desktop arrow (`.nav-list-arrow`, `arrow_right_alt` at `size="4xl"` `weight="700"`) follows the active row at once, without waiting for the photo. Only one arrow shows at a time: the previous one fades out in place in 0.12 s (no slide back into its word) and is moved to its waiting spot once invisible; the new one waits 0.1 s, then slides in from the left while it fades in (`playNavListArrows()` / `settleNavListArrows()`, GSAP `xPercent` −40 → 0). CSS (`is-active`) shows the active arrow before GSAP loads; reduced motion shows it with no slide.
- **Photos**: no `<img>` until `matchMedia('(min-width: 1024px)')` confirms the desktop layout, so phones never request one. Only index 0 mounts at first. The rest mount on the first `pointerenter` or `focusin`, and `activate(i)` also mounts `i`. The panel is `aria-hidden` and images use `alt=""`. Nothing is `priority`. `sizes` includes a fixed 520px column, so the image sets `ngSrcset` directly.
- **Admin**: Home Manager tab "Section 3: Category list" (`home-nav-list-preview`, `home-nav-list-editor`). Draft mutations live on `HomeDraftService`.

## Step 1b additions

- **Shared UI**: `app-product-card` (`@shared/components/product-card`): on.com-style listing card for category, brand, search, favorites, homepage New Arrivals, and the Shop page (no frame/radius/card shadow; 4:5 contained photo on soft gray; optional black uppercase `marketingBadge`; thin outline/filled **favorite** heart top-right that must not open the PDP; colour row under the photo; bold name; second line "Men – T-shirts & polos" (`genderCategoryLine()`, category name from `CatalogService.categoryBySlug()`) when `gender` is set, otherwise the short desc from `summary` or the first description line). **Colour row**: built from the product's stored `colorSiblings` list (`colorwaysFromSiblings()`), so grids make no extra read for colours; same rules as `app-product-siblings` (fixed document-id order, the card's own colour underlined in place, other colours only while in stock, no row when there is no other colour), up to 8 photos then `+N` (`PRODUCT_CARD_COLORWAY_CAP`). Mouse hover or keyboard focus shows that colour's photo and a click opens it; on touch the first tap shows the photo (the photo then opens that colour) and a second tap opens it. `productToCardData(product, price)` and `searchHitToCardData(hit, price)` take no sibling map any more. `app-product-price` (`@shared/components/product-price`): the only storefront price (`tone="listing"` = bold sale + struck compare-at in lighter gray, no %/offer badges or red sale chrome; non-sale stays regular weight). It reads `CurrencyService.entry()`, converts with `toDisplayAmount`, and formats with `formatMoney`. The struck-through list price is shown only when its converted, rounded display amount is higher than the sale amount. Listing tone never renders badges; on PDP (`default`), outside EGP badges that contain an EGP amount are dropped and percentage badges stay. `app-shipping-banner` (`@shared/components/shipping-banner`): dismissible announcement fed by `ShippingSettingsService` (Egypt box “from” fee, free-over, promo banner). Main layout waits on `ShellReadyService.chromeReady()` before mounting the banner on first load; SSR seeds shipping via `shippingSettingsResolver` → TransferState. The banner and the shipping line are empty when the selected currency is not EGP. `html[data-cur-pending] app-shipping-banner { display: none }` hides the server-rendered EGP bar until a foreign currency resolves. Egypt does not set that attribute. Settings → Shipping edits one to three Egypt boxes and one to three abroad boxes (weight/dims/fee; Add Box / Remove Box on the last one). Checkout shows a Shipping amount only. `parcelWeight()` + `planDelivery()` (engine `shipping.ts`, used by checkout and `priceStoreOrder`) decide delivery: `assignShippingBox` picks the box (largest box when a weight is missing, 0 g counts as known), Egypt heavier than every box is `to-be-agreed`, abroad heavier is `too-heavy`; the client cannot choose a box. Default product weights: `defaultWeightGrams(categoryIds, name, saved)` in `catalog-taxonomy.ts` (both copies; saved `categories/{id}.defaultWeightGrams`, then built-in `DEFAULT_WEIGHT_GRAMS_BY_CATEGORY`; prefills the product form on create). Catalogue Tools → **Shipping Weights** (`ProductWeightsDialogComponent` in `products-manager/dialogs/product-weights-dialog/`, `CatalogToolsService.productWeights()`, callable `productWeights`) edits category defaults, lists products without a weight, and runs Fill Empty Weights.
- **Homepage rows (AS-73 / AS-83)**: Order is Hero → Shop tiles → navigation-list categories → padel carousel → New Arrivals. `app-padel-carousel-section` ("Padel" heading, at most 8 rackets, name-only floating tiles on soft gray gradient, arrows + progress via `app-row-scroll-nav`) and `app-new-arrivals-section` (`.home-new-arrivals`: 3 visible from `md` + peek, 4:5 media with tightened section padding + viewport max-height so title + cards + arrow row fill one screen without oversized overflow; pool max 10 via `ProductService.listNewArrivals`; shared `app-product-card` including the favorite heart). Native `.scroll-row` scrollbar is hidden — only the thin `row-scroll-nav` progress remains. On desktop both rows lock in place while page scrolling moves through the cards (`RowScrollLockDirective`). Admin flags with `newArrivalUntil` (default now + 2 months; editable end date + “N days left” countdown). Distinct from `marketingBadge` NEW. Index: `published + newArrivalUntil`. Hero height uses `--storefront-top-chrome` (measured shipping banner + desktop nav hosts — no short wrappers around sticky nav).
- **Currency**: `CurrencyService` (`src/app/core/services/currency/currency.service.ts`). Signals: `selected`, `entry`, `ready`. Customers cannot pick a currency. Geo resolves country on the server (headers / IP) or via `/api/visitor-location` on client-rendered routes. `formatMoney` (`src/app/shared/utils/money.ts`) is the shared formatter and uses `Intl.NumberFormat` currency display. `EgpPricePipe` stays for admin. Checkout follows `OrderPricingSnapshot` (`src/app/core/services/orders/order-pricing.model.ts`) with Paymob (EGP) and Egypt-only COD via `CheckoutOrderService`. **`ShellReadyService`** (`@core/services/shell/`) composes currency, shipping, and auth readiness for the storefront shell; main layout uses `chromeReady()` for the first-load loader and banner.
- **Order number**: `shortOrderRef(orderId)` (`@core/services/orders/order-ref`) → `#A1B2C3` (first 6 id characters in capitals). Use it everywhere an order is shown to people (confirmation page, admin orders, emails). The functions copy in `functions/src/email/order-email-model.ts` must stay identical. Order lines carry a saved `name` / `optionLabels` / `imagePath` snapshot; prefer those over the live product and fall back for older orders.
- **Order date**: `orderDate(raw)` / `placedOn(raw)` (`@core/services/orders/shopper-orders.service`) read a saved `createdAt` (Timestamp, Date or ISO string) as a Date / "8 Nov 2026" (empty when unreadable). Used by the account Orders list and the confirmation page.
- **WhatsApp mark**: `WHATSAPP_ICON_PATH` (`@shared/utils/brand-icons`, Simple Icons, CC0) is the 24×24 SVG path for the WhatsApp logo; the footer social icons and the confirmation page's "Questions? Message us" button both use it. Draw it in an inline `<svg fill="currentColor">`.
- **Order stage + WhatsApp texts**: `orderStage()`, `paymentDue()`, `cashOnDeliveryEgp()`, `shopperWhatsappText()`, `staffWhatsappText()`, `shopperWhatsappNumber()`, `isEgyptMobile()` from `@core/config/order-messages` (generated from `functions/src/store/order-messages.ts`; edit that copy and run `npm run sync:engine`). Build the input with `orderMessageInput(order)` (`@core/services/orders/order-message-input`). Any UI or message that asks for money (InstaPay details, "send the screenshot") must come from `paymentDue()`, never from status or payment method checks of your own. Emails use the same module.
- **Store info**: `STORE_INFO` + `whatsappChatUrl(number, text?)` from `@core/config/store-info` (generated from `functions/src/store/store-info.ts`, edit that copy and run `npm run sync:engine`). Use it for any contact detail, WhatsApp link or social link on the site or in emails. Never hard-code them; skip fields that are empty strings. `isCardOrWalletLive()` reads the Card or Wallet switch (`payments.cardOrWallet`: `'coming-soon'` | `'live'`); any page or function that offers or takes Card or Wallet must check it instead of assuming Paymob is on.
- **Admin orders**: `/admin/orders` (`OrdersManagerPageComponent`) lists order lines in `<app-reusable-table>` with status filter tabs. `OrdersAdminService` (`src/app/features/admin/pages/orders-manager/services/orders-admin.service.ts`) loads recent `orders` and lean product stock lookups (`stock` / `stockBySize`) so current catalogue stock sits beside each line — never rely on the order pricing snapshot for stock. Order actions sit on the first line of each order (`orderActions()` in `utils/order-admin.utils.ts`): WhatsApp (staff text for the current stage) or Copy number, Confirm order (cash on delivery) / Confirm payment (InstaPay, behind `ConfirmDialogComponent`), and Cancel order (open cash on delivery / InstaPay only) via `OrdersAdminService.confirmCodOrder()` / `cancelOrder()`. Large Egypt orders (`fee-to-be-agreed`) show **Set Delivery Fee** instead of Confirm (then **Change Delivery Fee** while open), through `DeliveryFeeDialogComponent` (`dialogs/delivery-fee-dialog/`) and `OrdersAdminService.setDeliveryFee()`.
- **Core services**: `SearchService` (`@core/services/search`) — `search()` for `/search` and the search panel (min 2 chars, forces `inStock`, `hitsPerPage` default 24) and `browseCatalog()` for Shop (empty query, facets, optional in-stock). `OffersService` (`markEnded(id)` / `endedIds()`: an offer the order callables said has ended stays out of every price for the visit and is sent back as `endedOfferIds`; `now()`: the offer clock, moved every minute, for bag and checkout pricing) and the generated pricing engine (`@core/services/offers`), `ShippingSettingsService` (`@core/services/shipping`), `catalog-taxonomy.ts` (categories, brands, colour palette including `multi` / `MULTI_SWATCH_PANES`, `colorIdFor`). Algolia facets include `colors` (with Multi), `gender` (faceted, not filterOnly — Shop needs counts to show Shop for) and `players` (ids, faceted for the Player filter) for Shop filters (AS-74 / AS-79 / <KEY>-79); `playerNames` is searchable. `browseCatalog` runs InstantSearch-style disjunctive companion queries for `brandName` / `players` / `colors` / `sizes`.
- **Shop page (AS-74)**: `/shop` plus shared header on `/category/apparel|accessories|rackets` and Bags (`/category/accessories/bags`; `/category/all` → `/shop`, `/category/bags` → bags). Feature: `src/app/features/shop/` (`ShopPage`, `app-shop-header`, `app-shop-filters`, `app-shop-filters-drawer`, `app-shop-grid`). Show/Hide filters: Sort, Category (Bags under Accessories), Brand, Player (`?player=ale-galan`, ids from `settings/players`, names from `PlayerListService`; only players whose ids are in the `players` facet, i.e. with published products, plus any already chosen; with exactly one player chosen the page title is that player's name; `playerOptionsFromFacets()` in `utils/shop-filters.ts`), Size (apparel letters + sock labels when present), Color (`app-color-swatch` including **Multi**, with a tick on chosen colours), New arrivals (`?newArrivals=1`: Algolia `newArrivalUntilMs > <start of the current hour>`, the same products as the home row's `newArrivalUntil`; the page title becomes "New Arrivals" on `/shop`), On sale, In stock; Gender hidden until facet data exists. Filter lists show names only (no counts), and there is no price filter (sorting by price stays; old `priceMin`/`priceMax` links are cleared on the next filter change). The desktop aside animates with `animate.enter` / `animate.leave`; the phone drawer slides (`motion-reduce:transition-none`). Dense `.shop-product-grid` (2-col mobile / 3-col desktop). Mobile reuses the full-height slide-up drawer pattern. Brand + merchandising paths stay on `CategoryComponent` (Firestore).
- **Rule**: never edit `src/app/core/services/offers/engine/*`; change `functions/src/offers/engine/*` and run `npm run sync:engine`.
- **Buy X Get Y (engine `buy-x-get-y.ts`)**: `priceBagDeals(lines, offers, ctx)` prices a whole bag (per-line `BagLineFacts`: product, variant, quantity, `basePrice` before per-item offers, `offerPrice` after `priceItem`, `onSale`, `giftWorth`; one discount per item: each group gets the Buy X Get Y discount or its pieces' per-item offers, whichever saves more) and returns per-line `deals` / `discount` / `giftUnits` / `dealUnits` / `offerUnits` / `before` / `total`, the offers used (`offerIds`) and bag nudges (`hints`: `add-more`, `choose-free`). `dealTag(deals, quantity)` → "Free" / "1 free" / "−50%". `freeItemProductIds(getConditions)` reads a product-list free item. Browser wrapper: `priceBag(lines, products, offers, ctx)`, `bagLineVariant()`, `dealPickTitle()` in `@core/services/cart/cart-deals`; the nudge's wording and button come from `dealHintText(hint, offer, categoryName)` / `dealHintAction(offer)` (`add-same` → Add 2, `shop` → Shop the Offer, `browse` → Keep Shopping) in `@core/services/offers/offer-shop`, which also has `canShopOffer()`, `offerShopQuery()` and `offerShopSubtitle()` for Shop's `?offer=<id>` page (`parseOfferParam()` + the `offerId` option of `buildCatalogBrowseOptions()` in `features/shop/utils/shop-filters.ts`, filtering the filter-only `offerIds` attribute). `app-shop-header` takes an optional `subtitle` and shows a skeleton while `title` is empty (used by the bag and checkout; the server uses the engine directly in `priceStoreOrder`). `app-bag-free-pick` (`layout/cart-drawer/components/bag-free-pick/`) shows a `choose-free` hint as photo tiles and adds the picked product. `.deal-tag` (`styles/tailwind/components/deals.css`) is the small "Free" / "−50%" tag; `.bag-deal-pick` lives in `cart-drawer.css` (inside the card it sits in `.bag-card__pick`). `toGiftChoice()` / `GiftChoiceView` moved to `@core/services/cart/cart-gifts` (shared by the Gift Box and the bag; `features/product/utils/product-gifts.ts` re-exports them).
- **Free gifts (engine `gifts.ts`)**: `giftOfferForProduct(product, variant, offers, ctx, choices)` returns the live Free gift offer for a product (`PricedProduct`, so an offer with `saleItems: 'exclude'` skips one already on sale) with only published, in-stock choices (`GiftChoiceFacts`), `giftOfferById()` re-checks the offer a bag line names, `checkGiftPicks()` validates the shopper's picks, `giftChoiceIds(offers)` lists every gift product id to load. Bag lines carry picks as `CartLineDraft.gifts` (`CartLineGift`, `MAX_LINE_GIFTS`); the product page builds them (`features/product/utils/product-gifts.ts`: `toGiftChoice`, `buildGiftBox`, `effectiveGiftPicks`, `giftSteps`, `missingGiftPrompt`, `cartLineGifts`). Bag, checkout and confirmation name a gift with `giftLineLabel(giftName, giftProductLabel(product), size)` and `giftNameFor(offers, offerId, giftId)` (`@core/services/cart/cart-gifts`). Server side: `resolveLineGifts` (`functions/src/orders/order-gifts.ts`) and `readGiftOfferUses` / `releaseGiftOfferUses` (`offer-usage.ts`). Order lines with `gift` are free gifts listed after their item (`forLine`).

## Step 2 · Product page + listing pages

- **Pricing & offer helpers**: `toPricedProduct` (`@core/services/offers/offer.model`, widened via `PricingInput`) and `toVariantFacts` (`@core/services/products` / `src/app/core/services/products/utils/priced-product.utils.ts`). `PublicOffersReader` (`@core/services/offers/public-offers.reader`) runs a one-shot `active == true && visibility == 'public'` read without opening a listener, and `TransferOffer` (`toTransferOffer` / `fromTransferOffer` in `@core/services/offers/offer-transfer`) serializes offer schedule dates as epoch ms across `TransferState`.
- **Cart seam**: `CartLineDraft` (`@core/services/cart/cart.model`) is the typed draft payload (`productId`, `variantId`, `selection`, `quantity` — no prices; `cartLineKey(line)` in the same file is a line's stable identity) handed to `<app-add-to-bag-button>`. Bag display pricing lives in `cart-deals.ts` (`priceBag`: per-item offers + Buy X Get Y, shared by the bag and checkout) and `cart-pricing.ts` (`lineDisplayAmount`, `cartSubtotalDisplay`, `canCheckout`) — convert catalog EGP with `toDisplayAmount` / `formatMoney` in the drawer (same pattern as `app-product-price`); checkout still re-prices from Firestore. Pure util tests: `npm run test:cart` (`scripts/cart-pricing.spec.mjs`).
- **Footer** (`app-footer`, `src/app/layout/footer/`): link columns, bottom row with social icons, and `app-footer-signup` (signed-out visitors only) backed by `EmailSignupService` (`layout/footer/services/`, callable `subscribeToEmails`). `footerSocialLinks()` / `footerLabel()` live in `layout/footer/utils/footer-links.ts`; sign-up wording and error mapping in `utils/signup-message.ts`. Brand icons (Facebook, Instagram, TikTok, WhatsApp) are inline SVG paths there, since Material Symbols has no brand marks. Add a social network by adding its link to `store-info.ts` and a path to `ICON_PATHS`. See AGENTS.md → Storefront shell.
- **Search panel** (`app-search-panel`, `src/app/layout/search-panel/`): the navbar and mobile-bar search icons call `SearchPanelService.open(trigger)` (`layout/search-panel/services/`), which lazy-imports the component and opens it with CDK `Dialog` (not `MatDialog`): a 28rem side panel from the right from `lg`, full screen below. CDK gives the focus trap, Esc / backdrop close, page scroll lock and focus back to the icon; any `NavigationStart` closes it, and a failed chunk load falls back to `/search`. From 2 letters (250 ms typing pause) it lists up to `SEARCH_PANEL_MAX_RESULTS` (6) hits from `SearchService.search({ hitsPerPage: 6 })` with photo, brand, name and `<app-product-price tone="listing">`; Enter or **See All Results** opens `/search?q=…`. The shell (`.side-panel`, `.side-panel__header`, `__body`, `__footer`, slide-in from the right on `lg`, rise on phone, no motion when reduced) is `src/styles/tailwind/components/side-panel.css`, shared with the account panel; search-only styles are the `.search-panel__*` classes in `search-panel.css`. A new side panel puts `side-panel` on its host and opens with CDK `Dialog` the same way.
- **Account panel** (`app-account-panel`, `src/app/layout/account-panel/`): the signed-in account icon (`app-account-menu`) calls `AccountPanelService.open(trigger)` (`layout/account-panel/services/`), same pattern as the search panel (lazy import, CDK `Dialog`, `.side-panel`, closes on `NavigationStart`, falls back to `/account` when the chunk can't load). Styles: `src/styles/tailwind/components/account-panel.css` (`.account-avatar` round first-letter badge, `.account-panel__*`, and the `/account` page classes `.account-section` (section card; host also `block w-full`), `.account-section__title`, `.account-page__tabs` / `__tab`, `.account-order-row`).
- **Shopper account page** (`/account`, `src/app/features/account/`): `account.page.ts` plus `components/{profile,address,emails,orders}-section/` (Signal Forms with `<app-text-input>` / `<app-select-input>`). Data: `UserProfileService` (`watch`, `saveDetails`, `saveAddress`, `setMarketingOptIn`; `SavedAddressSchema`, `accountDisplayName()`, `accountInitial()`, `isProfileIncomplete()` in `@core/services/user-profile`), `ShopperOrdersService.watch(uid, max)` → `ShopperOrderRow` (`@core/services/orders/shopper-orders.service.ts`), `orderStatusName(stage)` (`@core/services/orders/order-status-name.ts`, also used by the confirmation page). Guard: `accountAuthGuard` (`@core/guards/account/`).
- **Listing price for an Algolia hit**: `searchHitCardPrice(hit, offers | null, ctx)` (`@shared/components/product-card/product-card.utils`) — live offers through the pricing engine, or Algolia's display fields when `null`. Used by `/search`, Shop grid and the search panel; never re-implement the loop.
- **Cart drawer** (`app-cart-drawer`): shows each line’s display price and a subtotal. Product details are read per distinct product id (`#productIds`, sorted, custom `equal`), so + / − never re-reads Firestore; the loader reads only ids not loaded yet, and a `linkedSignal` keeps the loaded products on screen while a newly added one loads (only that row waits). Each product is read on its own and the read never throws, so one bad line never breaks the bag: a deleted or unpublished product (permission-denied for shoppers, `published: false` for admins) is stored as `null` and its row shows "No longer available" with only a remove button; any other read failure (offline, schema) is left out so the next load tries again. Rows use `track lineKey(line)` (`cartLineKey()` from `cart.model.ts`: product + variant + chosen options, the same key `CartService.add` merges on), never `track $index`. **Checkout** links to `/checkout` when the bag has items; the empty bag has no footer, only **Start Shopping**. Bag redesign (Nov 2026): the component takes `placement` (`'side'` desktop drawer, `'sheet'` phone panel) so only the phone copy (`placement === 'sheet'`) shows and loads **Recommended for You**, up to 4 cards; the desktop side bag has no such row and reads nothing (a `linkedSignal` latch turns on the first time that copy opens; `resource()` over `SearchService.browseCatalog` with `bagRecommendationFilter()` on the bag's main `categoryId`s, `BAG_RECOMMENDATION_FETCH` hits so products already in the bag can be left out by `pickBagRecommendations()`; cards priced with `searchHitCardPrice()` like Shop, in a `.scroll-row` with `appHorizontalScroll`, `[enableWheel]="false"` so the wheel still scrolls the bag, and `[trackScroll]="true"` feeding `app-row-scroll-nav` arrows + progress under the row, shown only when it can scroll; no scroll lock). **Payment Methods** come from `bagPaymentMethods(isEgypt, isCardOrWalletLive())` (`id`, `name`, `comingSoon`; Card or Wallet comes last while it is coming soon) and show as three equal `.bag-pay-tile`s with `app-payment-mark size="lg"`: the InstaPay tile is the logo alone (`alone`, alt "InstaPay"), the others the icon with the name under it, and a coming-soon tile is `.bag-pay-tile--soon` (dashed, grey, its content at 40% opacity) with "Coming soon". Helpers: `layout/cart-drawer/utils/bag-extras.ts`. Styles: `src/styles/tailwind/components/cart-drawer.css` (`.bag-card` item card with `.bag-card__body`, `.bag-card__photo`, `.bag-card__stepper` square − / + box, `.bag-card__gift` gift row, `.bag-card__strip` offer strip and `.bag-card__strip--hint` dashed nudge, `.bag-card__pick` free-item tiles; `.bag-pay-tile` / `.bag-pay-tile--soon` payment tiles). Desktop end-drawer is `position: fixed; height: 100dvh` under `app-main-layout` (`_sidenav.scss`) so the footer stays in the viewport (absolute drawers otherwise stretch with the tall `min-h-screen` container). Mobile uses the fixed `h-dvh` slide-up panel in `app-mobile-nav`. Navbar bag badges (`NavbarActionsComponent`, `MobileNavComponent`) read `CartService.count` — never a hard-coded badge count. `CartService` is per person: guests in `localStorage`, signed-in shoppers in `carts/{uid}` (live), merged on sign-in and emptied on sign-out (see AGENTS.md Checkout payments). Wait for `CartService.waitUntilReady()` before treating an empty bag as final, and add or change lines only through `add` / `removeAt` / `setQuantity` / `clear`, never by writing storage or the doc yourself.
- **Product page feature (`src/app/features/product/`)**: `ProductComponent` (`app-product`), `productPageResolver` (`resolvers/product-page.resolver.ts`), `ProductGalleryComponent` (`app-product-gallery`: scroll-snap row, swipe on touch and drag with a mouse (a 15% flick moves one photo), arrows and `1/6` counter centred under the photos (counts positions: two photos side by side make 6 photos `1/5` … `5/5`), `sizes` = `PDP_GALLERY_SIZES` from `@core/image/image-kit.loader`; the first photo is `priority`, so Angular writes the server preload), `ProductOptionsComponent` (`app-product-options`: size behind a "Select a Size" opener, colour swatches with "Colour: Navy", other choices as boxes; `prompt` input = `ChoicePrompt` opens the size list, shows the message and focuses the first choice), `ProductSiblingsComponent` (`app-product-siblings`: every colour of the same `modelGroup` as 64px photo links in the details column, in one fixed order (Firestore document id) with the open colour underlined in its place (`aria-current="page"`); the group is read once per model, so switching colours reuses it; a plain click navigates with `scroll: 'manual'` so the page stays where it is, `@defer (on idle)`), `ProductGiftBoxComponent` (`app-product-gift-box`: the Free gift offer as numbered steps, gift choices as photo tiles and sizes as boxes, every choice a button with `aria-pressed`; `prompt` input focuses the open step), and `AddToBagButtonComponent` (`app-add-to-bag-button`: stays enabled while in stock, emits `choiceMissing` instead of adding when a choice is missing). The description (`descriptionHtml`, prose) sits in the details column under the price (`.pdp-description`; the short `summary` is not shown on the page). Under the photos (same column width on desktop, below the details on phones): native `<details>` rows, closed at first and animated open/close, **Materials** or **Specifications** (`productDetailsTitle(categoryIds)`, lists `details` one per line; only when `details` has lines) and **Shipping** (from `ShippingSettingsService`; outside EGP "Shipping is worked out at checkout."; the EGP list keeps `.pdp-shipping-line` so `html[data-cur-pending]` hides it). Full-width Material button: `.btn-block` (`_buttons.scss`, 48px tall).
- **Category / brand listings (`src/app/features/category/`)**: Brand routes and merchandising-only paths still use `CategoryComponent` + `ProductService.listPublished`. Apparel / Accessories / Padel / Bags / All use the Algolia-backed Shop page (see Shop page above). Grid helper `CatalogProductGridComponent` remains for brand listings. Query resolve helper: `utils/catalog-list-query.ts`. Merchandising-only paths (`sale`, `…/new`, `…/best-sellers`) stay empty until dedicated filters exist. **Empty listings:** `catalogListCount()` from `settings/catalog` shows the empty state without card skeletons; while the list fetch runs use page `<app-loader>`, not `[loading]` on the grid. Indexes already cover `published + categoryIds + createdAt` and `published + brandId + createdAt`.
- **Marketing badge**: product field `marketingBadge: { kind: NEW|BESTSELLER|LIMITED_EDITION, style: plain|boxed } | null` (Valibot + admin editor + Algolia `marketingBadgeKind` / `marketingBadgeStyle` / `shortDescription`). Distinct from freeform `tags` slugs.
- **New arrival window**: product field `newArrivalUntil: Timestamp | null` (Valibot + admin checkbox/date). Unexpired docs lead the homepage New Arrivals row; expired or null fall through to newest-by-`createdAt` fill. Not indexed in Algolia.
- **Favorites**: `FavoritesService` (`@core/services/favorites`) listens to `favorites/{uid}/items/{productId}` (`productId`, `slug`, `addedAt`). Call it **favorite** everywhere (not wishlist). Guest heart (card + PDP) → `FavoritesGateService` opens `<app-favorites-sign-in-dialog>` (never local/anonymous saves; heart stays outline for guests). Sign in / Create account stashes the product in `sessionStorage` and goes to `/login?returnUrl=…` (`intent=create` for Create account); after auth, `add()` (not toggle) saves it. `/favorites` (client-rendered, `private, no-store`, `favoritesAuthGuard`) reads each product by `productId` with `getById` and drops unpublished ones; the saved `slug` is only the address at save time and may be out of date (<KEY>-115), so never load or link by it. Rules: owner-only create/delete on items.
- **User profile / signup consent**: `UserProfileService` writes `users/{uid}` (`termsAcceptedAt`, `termsVersion`, `marketingOptIn`, `marketingOptInAt`). Create-account + Google new-user paths require Terms/Privacy acceptance; marketing opt-in copy is “Check this box if you want to receive discount offers and similar emails” (optional, off by default). Draft `/terms` + `/privacy` live in `features/legal/*.page.html` (one editable HTML file each; draft banner + `[TBC: …]` markers). Deploy `fb:rules:dev` before consent writes succeed against live rules. `AuthService.consentReady` / `needsConsent` hold leave-after-sign-in until the profile check (or write) finishes, including after reload. Shopper-account guards call `requireAgreedAccount(url)` (`@core/guards/account/require-account.ts`, awaits `AuthService.waitForAccountReady()`): visitors and accounts still needing terms go to `/login?returnUrl=…`. Order callables call `requireAcceptedTerms(uid)` (`functions/src/auth/require-accepted-terms.ts`, pure check `hasAcceptedTerms` tested in `accepted-terms.test.ts`).
- **HTML cache**: Geo-priced storefront routes (`/`, `shop`, `product/**`, `category/**`, `brand/**`, `search`) use `private, no-store` so App Hosting CDN does not cache visitor-specific prices. The product resolver sets `private, no-store` on 503 and 404 as well.
- **Rule**: storefront product queries must go through `getBySlug` / `listPublished` (or `listModelGroup`) with `where('published', '==', true)`. A single product the shopper already holds by id (favourites, gift choices, checkout lines) is read with `getById`, which returns `null` on permission-denied; also drop `published === false` there, because an admin can read unpublished products.
