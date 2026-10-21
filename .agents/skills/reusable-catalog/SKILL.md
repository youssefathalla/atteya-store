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

### 🃏 Cards & Layout Containers (`src/app/shared/ui/cards/`)

- `<app-base-card>`: Elevated surface container with hover glow and slots: `card-header`, `card-content`, `card-sub-content`, `card-actions`.
- `<app-info-card [title]="..." [value]="..." [icon]="...">`: Metric & KPI statistics card.
- `<app-review-card [review]="review">`: Testimonial and customer rating card.

### 💬 Dialogs & Modals (`src/app/shared/ui/dialogs/`)

- `<app-base-dialog>`: Foundation shell for dialog titles, content, and action buttons.
- `<app-confirm-dialog>`: Ready-to-use confirmation dialog (Delete, Cancel, Proceed).
- `<app-img-preview-dialog>`: Lightbox image preview modal.

### 💎 Brand, Loaders & Media Editors

- `<mat-icon name="home" />`: Always import `SharedIconModule` from `@shared/ui/mat-icon`.
- `<app-logo [size]="'sm' | 'md' | 'lg'" />`: App branding logo SVG.
- `<app-loader>`: Standardized loading spinner overlay for blocking actions/overlays.
- `<app-skeleton [overlay]="false" />` (`src/app/shared/ui/skeleton/`): Reusable light-mode M3 shimmer placeholder (`aspect-4/5`, `aspect-16/9`, `aspect-square`, etc.) & overlay veil. When `overlay` is present (`<app-skeleton overlay />`), becomes an `absolute inset-0 size-full z-50 bg-surface` veil that covers buttons and text underneath so nothing shows through or can be clicked while loading.
- `<app-image-picker folder="hero" [asset]="asset()" (assetChange)="..." (uploaded)="..." />` (`src/app/shared/ui/image-picker/`): Single-image uploader + web URL importer + alt text field + live preview. Alt text is required unless `[altOptional]="true"` (decorative photos, such as the homepage category list). `[aspectClass]` sets the preview frame (`aspect-4/5` for that list). Folder `categories` is allowed.
- `<app-image-gallery-editor [folder]="'products/' + productId" [images]="images()" (imagesChange)="..." (uploaded)="..." />` (`src/app/shared/ui/image-gallery-editor/`): Multi-image gallery editor (up to 8 images, CDK drag-drop reorder, index 0 badged as "Main Image", required per-image alt text).

---

## 2. Extracted Tailwind Classes

Located in `src/styles/tailwind/components/`. Use these classes directly in your templates.

| File                  | Reusable Classes                   | Description                                                                                                                                                                                                                                          |
| :-------------------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation.css`      | `.nav-column-title`                | Uppercase category/column headers with bottom border                                                                                                                                                                                                 |
|                       | `.nav-list`                        | Homepage category-list rows. Bordered full-width stack below `lg`; content-width from `lg` up                                                                                                                                                      |
|                       | `.nav-list-link`                   | Category link or preview button. Full-width row below `lg` (arrow at the row end). From `lg` up the link is only as wide as its label, and the arrow sits directly after the words |
|                       | `.nav-list-panel`                  | 4:5 photo column (max 520px). `hidden` below `lg`. The image itself is not rendered until the browser confirms the desktop layout                                                                                   |
|                       | `.nav-menu-link`                   | Interactive nav item link with hover state and transitions                                                                                                                                                                                           |
|                       | `.nav-badge`                       | Small badge indicator for menu links                                                                                                                                                                                                                 |
|                       | `.nav-category-tab`                | Top-level category tab button in navigation bar                                                                                                                                                                                                      |
|                       | `.drag-handle-wrapper`             | Drag handles for re-ordering items in admin dashboards                                                                                                                                                                                               |
|                       | `.nav-admin-card`                  | Styled card for admin navigation items                                                                                                                                                                                                               |
| `status.css`          | `.status-badge`                    | Badge background, padding, and text formatting                                                                                                                                                                                                       |
|                       | `.chip`                            | Rounded interactive filter chip                                                                                                                                                                                                                      |
|                       | `.chip-icon-wrapper`               | Icon container inside filter chips                                                                                                                                                                                                                   |
|                       | `.vehicle-status`                  | Card container with outline-variant border and padding                                                                                                                                                                                               |
| `spacing.css`         | `.container-content`               | Unified page section container (`flex flex-col flex-1 p-[5cqw] w-full` querying `<main class="@container">`). Never combine with `.section-space` or `@container` on the same element |
|                       | `.hero-space`                      | Standard hero section spacing                                                                                                                                                                                                                        |
|                       | `.section-space`                   | Standalone vertical spacing (`py-[5cqw]`) when horizontal padding is not needed                                                                                                                                                                      |
| `images.css`          | `.image-mask`                      | Image clipping and gradient mask                                                                                                                                                                                                                     |
|                       | `.hero-image`                      | Full-width responsive hero image container                                                                                                                                                                                                           |
| `scroll-row.css`      | `.scroll-row` + `.scroll-row-item` | Horizontal snap-scroll row with "card peek". Tune via `--scroll-cols`, `--scroll-peek` (`0px` when all cards fit), `--scroll-gap`; make responsive with Tailwind, e.g. `scroll-row md:[--scroll-cols:2] xl:[--scroll-cols:3] xl:[--scroll-peek:0px]` |
| `skeleton.css`        | `.skeleton`                        | Light-mode M3 shimmer surface (`surface-container-high` to `surface-container-lowest`, `border-shape`, reduced-motion safe)                                                                                                                          |
|                       | `.skeleton-overlay`                | Full-bleed card overlay veil (`absolute inset-0 size-full z-50 bg-surface`)                                                                                                                                                                          |
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
  - `login(email, password)`, `loginWithGoogle()` (popup, then redirect if the popup is blocked), `linkPendingGoogle(email, password)` for `auth/account-exists-with-different-credential`, `logout()`, `sendPasswordReset(email)`, `refreshRole(force?)`, `redirectIfNoLongerAdmin(returnUrl)`.
  - No self sign-up. Do not call `createUserWithEmailAndPassword`.
  - While signed in, an `rxResource` listens to `roles/{uid}` and calls `getIdToken(true)` when the mirror role differs from the token.
  - `/login` is `features/auth/login`. The navbar account menu is `app-account-menu`.
- **`NavService`** (`src/app/core/services/navigation/nav.service.ts`):
  - `categories`: Computed signal for live navigation catalog with fallback.
  - `isLoading`: Computed state signal.
  - `updateNavigation(categories)`, `seedDefaultNavigation()`.
- **`ImageSourceService`** (`src/app/core/services/storage/image-source.service.ts`):
  - **Primary entry point for admin image uploads & URL resolution.**
  - `uploadFile(file, folder)`: Validates format (JPG/PNG/WebP/AVIF, max 10MB, no SVG), reads local dimensions, uploads to Storage, and probes ImageKit delivery.
  - `resolveInput(raw, folder)`: Parses user input (`parseImageInput`), verifies managed paths via a CORS-safe `new Image()` ImageKit probe, or imports external URLs via the `importImageFromUrl` Cloud Function. Throws plain-language `ImageInputError`, including `NOT_ALLOWED` when Storage or the callable rejects the caller.
- **`StorageUploadService`** (`src/app/core/services/storage/storage-upload.service.ts`):
  - `uploadImage(file, folder = 'hero')`: Uploads image (`File`) to Firebase Storage via `uploadBytes()`, returning `{ path: string }` (does not call `getDownloadURL()`).
  - `importFromUrl(url, folder = 'hero')`: Calls the `importImageFromUrl` 2nd-gen Callable Cloud Function (`functions/src/import-image.fn.ts`) to fetch external URLs server-side without browser CORS issues and save directly to Storage. The function rejects callers who are not `role: 'admin'`.
  - `deleteImage(pathOrUrl)` / `deleteImages(paths)`: Deletes managed Storage files while ignoring `/img/`, external URLs, or `PROTECTED_STORAGE_PATHS`.
  - `isUploading`: Read-only `Signal<boolean>` tracking active upload status.
- **`StorageAssetTracker`** (`src/app/core/services/storage/storage-asset-tracker.ts`):
  - Per-draft session upload tracker (instantiated per feature draft service, e.g. `new StorageAssetTracker()`).
  - Methods: `register(path)`, `clear()`, `orphansOnPublish(previousLive, kept)`, `orphansOnDiscard(live)`, `orphansOnReset(live)`.

---

## 4. Shared Directives & Pipes

- **`AppImageFallbackDirective`** (`src/app/shared/directives/image-fallback`):
  - Selector: `img[appImageFallback]` (bind `<img [ngSrc]="path" [appImageFallback]="path" ... />`).
  - Automatically displays a monochrome `.skeleton` shimmer while the image loads, and fails over once to `buildStorageUrl(path)` if ImageKit CDN fails or is still syncing.
- **`HorizontalScrollDirective`** (`src/app/shared/directives/horizontal-scroll`):
  - Enables smooth drag-to-scroll and mouse-wheel horizontal scrolling.
  - `<div appHorizontalScroll [snapToItems]="false" [wheelSpeed]="2.0" [dragSpeed]="1.5">`
- **`TemplateTypeDirective`** (`src/app/shared/directives/template-type`):
  - Provides type-safety for `ng-template` context variables.
- **`PenceToPoundsPipe`** (`src/app/shared/pipes/`):
  - Converts integer pence into formatted GBP currency strings.
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
  - `createValibotConverter(schema)`: Creates a strongly typed `FirestoreDataConverter<T>` powered by Valibot `v.parse()`, injecting document `id`.
- **Firestore Signals** (`src/app/shared/utils/firebase/firestore-signals.ts`):
  - `signalDoc(docRef)`: Binds a Firestore document snapshot directly to an Angular Signal (SSR-safe, auto-unsubscribing).
  - `signalCollection(queryRef)`: Binds a Firestore query/collection to an Angular Signal (SSR-safe, auto-unsubscribing).
- **Error Handling & Retry** (`src/app/shared/utils/firebase/`):
  - `firebaseErrors(error)` / `mapFirebaseError` / `handleFirebaseError`: Translates Firebase Auth, Firestore, Storage, and Functions errors into user-friendly status messages.
  - `authRetryConfig` / `firestoreRetryConfig`: RxJS retry configurations for transient network failures.
  - `withRetry(operation, options)`: Retries idempotent async Promise operations with exponential backoff.

---

## 6. Shared Logic & Breakpoint Utilities

Located in `src/app/shared/utils/`:

- **`useBreakpoint`** (`src/app/shared/utils/breakpoint.utils.ts`):
  - Returns a reactive `Signal<boolean>` indicating whether the media query matches.
  - Automatically wraps Angular CDK `BreakpointObserver` in `toSignal()`.
  - Usage: `readonly isDesktop = useBreakpoint(1280);` or `useBreakpoint('(min-width: 1024px)')`.
- **`useStepperOrientation`** (`src/app/shared/utils/stepper-orientation.utils.ts`):
  - Returns a reactive `Signal<StepperOrientation>` (`'horizontal' | 'vertical'`) for Material Stepper components.
  - Usage: `readonly stepperOrientation = useStepperOrientation(800);`
- **Image Pipeline Utilities** (`src/app/shared/utils/image/` — re-exported via `@shared/utils/image` and `@shared/utils/image.utils`):
  - `IMAGE_LIMITS`, `IMAGE_FOLDERS`, `ImageFolderPath`, `PROTECTED_STORAGE_PATHS`.
  - `normalizeImageKitPath(urlOrPath)`: Normalizes managed Storage/ImageKit URLs (verifying `environment.firebase.storageBucket`) into relative paths for `NgOptimizedImage`.
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

The custom claim `role: 'admin'` is the only admin grant. `AdminRolesService` (`src/app/features/admin/pages/settings/services/admin-roles.service.ts`) calls `listAdmins` and `setUserRole` and reads the latest 20 `auditLogs`. The Admins tab is `/admin/settings/admins`. The repo copy of the bootstrap script is `functions/scripts/set-admin.mjs` (`--role`, `--show`, `--list`). `--list` and `listAdmins` read Auth claims, so they work when `roles/{uid}` was never written. `setUserRole` refuses to remove the last admin, writes one audit record, and revokes refresh tokens on removal. App Check enforcement stays off until `APP_CHECK_ENFORCED` is set.

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
- **Data**: optional `settings/home.navList`, then localStorage `atteya_store_home_nav_list`, then `DEFAULT_HOME_NAV_LIST`.
- **Motion**: first storefront GSAP use. `import('gsap')` runs inside `afterNextRender`. Tweens live in a `gsap.context` scoped to the host and `revert()` on destroy. The server HTML marks the first link active. Once the desktop panel mounts, CSS shows that photo until GSAP runs. `prefers-reduced-motion` swaps with no scale.
- **Photos**: no `<img>` until `matchMedia('(min-width: 1024px)')` confirms the desktop layout, so phones never request one. Only index 0 mounts at first. The rest mount on the first `pointerenter` or `focusin`, and `activate(i)` also mounts `i`. The panel is `aria-hidden` and images use `alt=""`. Nothing is `priority`. `sizes` includes a fixed 520px column, so the image sets `ngSrcset` directly.
- **Admin**: Home Manager tab "Section 3: Category list" (`home-nav-list-preview`, `home-nav-list-editor`). Draft mutations live on `HomeDraftService`.
