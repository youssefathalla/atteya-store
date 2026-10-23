# 🤖 AI Agent Master Guide

This repository contains a production-grade **Angular v22+ (Zoneless, Signal-First)** application with **Tailwind CSS v4** and **Angular Material M3**.
Adhere strictly to these core directives to ensure maximum performance, clean architecture, and seamless collaboration.

---

## 🧠 1. Core Architectural Directives

### 🅰️ Angular & Signals (Strict Modern Standards)

- **Signal-First Reactivity**: Use `signal()`, `computed()`, and `effect()`. Zero Zone.js dependencies (`fakeAsync`, `tick` are forbidden).
- **Resource-First Data Fetching (v22+)**: Use `resource()` (Promises) and `rxResource()` (Observables/streams). Manual loading/error states (`isLoading = signal(false)`, manual `try/catch`, `error = signal(...)`) are forbidden.
- **Inputs & Outputs**: Use `input()` / `input.required()` and `output()`. No legacy `@Input` or `@Output`.
- **Control Flow**: Modern template syntax only (`@if`, `@for`, `@let`, `@switch`). No `*ngIf` or `*ngFor`.
- **Template Access**: Templates can read `private` component members; avoid redundant `protected` visibility.
- **Defaults in v22+**: Standalone (`standalone: true`), `OnPush`, and Zoneless are defaults in v22+. Do not write redundant flags or `provideZonelessChangeDetection()`.
- **HTTP Configuration**: `HttpClient` is provided in root by default. `provideHttpClient(...)` is optional and only needed when registering interceptors (`withInterceptors`), XSRF protection, or `withXhr()`. FetchBackend is the default engine (`withFetch()` is deprecated).
- **Services**: Use `@Service()` from `@angular/core` instead of legacy `@Injectable({ providedIn: 'root' })`.
- **Forms**: Prefer Signal Forms for modern state management.
- **Deep Reference**: Activate the **`angular-developer`** skill and review `.agents/skills/angular-developer/references/angular-version-matrix.md`.

### 🧭 Routing & Route Data

`withComponentInputBinding()` is **enabled** in `app.config.ts`, so route state flows into components as signals — no `ActivatedRoute` plumbing.

- **Router Resources (v22.2+)**: Route-level data fetching uses `resources: (ctx) => ({ ... })` with `nonBlocking(...)` instead of legacy resolvers. The resolved or streaming resource binds directly to component `input.required<Resource<T>>()`.
- **Throwing Redirects**: Throw `new RedirectCommand(router.parseUrl(...))` directly inside guards and resource loaders rather than returning UrlTrees.
- **Route data is an `input()`**: path params, matrix params, query params, static `data`, and resource output all bind to matching input names (`readonly id = input.required<string>();`).
- **Precedence on duplicate keys** (lowest to highest): query params -> path/matrix params -> static route `data` -> resource/resolver data.
- **`ActivatedRoute` is the exception**: reach for it only inside guards or when parent/child route state is needed. Never inject it just to read route params.
- **Lazy by default**: prefer `loadComponent` / `loadChildren` for feature routes.

### 🎨 Design System & Styling

- **The Contract**: Governed strictly by `.cursor/rules/design-system.mdc` (auto-loaded for `.html`, `.css`, `.scss`, and `.ts`). Cursor does not apply `.agents/rules`, so this rule lives only there. Adhere to all semantic tokens, M3 overrides, `<mat-icon name="icon" />` with `SharedIconModule`, and utility extraction rules.
- **Zero Tailwind on Angular Material**: Angular Material components (`button[matButton]`, `button[matIconButton]`, `<mat-icon>`, `<mat-menu>`, `<mat-drawer>`, etc.) are already fully styled by the M3 theme. **NEVER** apply Tailwind styling, color, transition, or hover classes to Material components. Only style **native HTML elements** (`<div>`, `<nav>`, `<section>`, `<ul>`, `<a>`, etc.) unless explicitly instructed by the user.
- **Monochrome (Black & White) Identity**: Brand aesthetic is strictly Black & White. `primary` is black; default text is naturally `text-on-surface` (inherited from `body`). **NEVER write `text-on-surface` on any element** — it is already the default inherited color and writing it is banned as redundant class bloat. Never add redundant child color overrides (e.g. `<span class="text-primary">.</span>`), and inherit colors cleanly.
- **Layout Alignment Shortcuts**: Always use custom layout shortcuts instead of writing verbose flex classes: Row: `elements-center`, `elements-start`, `elements-end`, `elements-between`. Column: `elements-center-col`, `elements-start-col`, `elements-end-col`, `elements-between-col`.
- **United Border Shape (`border-shape`)**: Single source of truth for corner radius across all elements is `border-shape` (`border-radius: var(--border-shape, 2px)`). Arbitrary `rounded`, `rounded-corner-xs`, `rounded-sm`, `rounded-md`, `rounded-lg` are strictly banned.
- **Button Loading State Standard**: During action loading (`isSaving()`, `isUploading()`, etc.), render **only the spinner** (`<mat-progress-spinner mode="indeterminate" diameter="18" />`). Never display text alongside a spinner. Swap the label/icon cleanly with `@if (isLoading()) { <mat-progress-spinner ... /> } @else { <mat-icon ... /> <span>Label</span> }` and provide `[attr.aria-label]="isLoading() ? 'Action...' : null"` for screen readers.
- **United Button Icon Sizing**: All `<mat-icon>` placed inside buttons (`matButton`, `matIconButton`, or native `<button>`) automatically default to `DEFAULT_BUTTON_ICON_SIZE` (`'lg'`) via `MatIconDirective` and `.mat-mdc-button-base mat-icon`. Never write `size="..."` on any icon inside a button.
- **Universal Plain-Language Microcopy**: All user- and admin-facing copy (buttons, dialogs, snackbars, alerts, hints, empty states) must speak the natural, everyday language of general users. Always communicate user intent and real-world outcomes rather than technical mechanisms, developer jargon, or underlying systems. Keep action labels simple, familiar, and active, and ensure all feedback is constructive, reassuring, and intuitive.
- **The Reference**: Activate the **`design-system`** skill for the styling directory map, token registration, Material overrides, and component APIs.

### 📐 Layout & Viewport Sizing Standards

1. **Top-Level Query Container**:
   - `<main>` inside `main.component.html` carries `@container`. Page-level sections and cards must use `cqw` to remain fluid relative to drawer open/close and responsive main layouts.
   - Never place `@container` on the same element where `cqw` padding is declared (CSS cannot query itself).
2. **Angular Component Host Sizing**:
   - All section and page components (`app-*-section`, `app-*`) must define `host: { class: 'block w-full' }` in `@Component()` to prevent `display: inline` height/width collapse.
3. **Full-Viewport Sections**:
   - Full-screen heroes directly below the header must use `h-[calc(100dvh-56px)]` (accounting for the 56px / `h-14` navbar).
   - When a full-height hero is specified, do NOT add `aspect-*` (`aspect-video`, `aspect-21/9`) to the slide containers, as `aspect-ratio` overrides height in modern CSS.
4. **Section Spacing**:
   - Use `.container-content` as the single unified class for page section layout and responsive container padding (`p-[5cqw]`). Do not append `.section-space` to elements that already have `.container-content`.

### 🛡️ Data Validation (active) & Firebase (target state)

- **Strict Validation — ACTIVE**: `valibot` is installed and in use (`src/app/shared/schemas/`, `src/app/shared/ui/status-badge/status.model.ts`). Pipe all external data through a schema (`v.parse()` / `v.safeParse()`) before use. Use `createValibotConverter()` for Firestore documents. See the **`typescript`** skill for the schema rules.

> [!IMPORTANT]
> **Native Firebase JS SDK (`firebase`) is standard.** Do NOT install or use `@angular/fire`. Native Firebase SDK functions (`getDoc`, `signInWithEmailAndPassword`, `onSnapshot`) are framework-agnostic, take explicit instances, and do NOT require an Angular injection context or `runInContext()` wrappers.

- **Admin access**: Firebase Auth custom claim `role: 'admin'` is the source of truth. Anything else, or a missing claim, is a normal user. Rules and callables check `token.role == 'admin'` only. Do not grant admin through Firestore data or a client write. `roles/{uid}` is a mirror index written only by the Admin SDK (`functions/scripts/set-admin.mjs`, `listAdmins`, `setUserRole`). It may be missing for an admin granted outside the repo; `listAdmins` and `--list` read the claim. Removing an admin revokes that account's refresh tokens and writes `roles/{uid}.revokeTimeMs` (Auth `tokensValidAfterTime` in milliseconds). Rules reject an admin token whose `auth_time` is older than that value, and admin callables do the same check against Auth. A missing mirror, or a mirror without `revokeTimeMs`, does not block an admin. `auditLogs/{id}` is append-only from the Admin SDK. Clients, including admins, cannot write either collection.
- **Storefront access**: `firebase/firestore.rules` allows anyone to read documents directly in `settings` (`settings/home`, `settings/navigation`, and any later sibling). Only an admin can write them. Subcollections under `settings` are admin-only. `firebase/storage.rules` lets anyone read objects under `hero/`, `categories/`, `products/`, and `brands/`. Only an admin can upload a JPEG, PNG, WebP, or AVIF under 10 MB there, and `hero/default-hero.jpg` cannot be deleted. Every other path is denied. Storefront pages still load images through ImageKit and the public bucket URL. `importImageFromUrl`, `listAdmins`, and `setUserRole` (`europe-west3`) require an admin caller. App Check is wired with `APP_CHECK_ENFORCED` defaulting to false until real reCAPTCHA Enterprise keys exist. There is no rules test suite in this repo.

- **Signals & Resources Integration**:
  - One-off reads (`getDoc`, `getDocs`): Feed directly into `resource()`.
  - Dynamic queries: Feed `onSnapshot` into `rxResource()`.
  - Static query listeners: Use `signalCollection()` or `signalDoc()`.
  - Updates automatically trigger zoneless change detection.
- **Query Efficiency**: Always apply `limit(n)` on list queries and use `getCountFromServer()` for counts.
- **Pagination**: Use cursor-based pagination. Only `PaginationServiceInterface<T>` exists today (`src/app/shared/ui/reusable-table/table.model.ts`); a concrete `PaginationService` still has to be written.

- **LIFT Structure**: Feature modules live in `src/app/features/[feature-name]/`. Co-locate template and style files inside `<name>/<name>.component.*`. When a feature or page has dedicated services, utils, dialogs, or subcomponents, organize them in explicit subfolders (`services/`, `utils/`, `dialogs/`, `components/`) to eliminate root folder clutter. Do NOT generate or write `.spec.ts` test files.
- **SEO Metadata**: Inject and configure `SeoService` ONLY inside top-level Route/Page components in `ngOnInit()`.
- **Performance (@defer)**:
  - Below-the-fold content: `@defer (hydrate on viewport)`.
  - Completely static content: `@defer (hydrate never)`.
  - Above-the-fold / Hero / LCP content: Do NOT defer.

### 🖼️ Image Delivery & Optimization Architecture (ImageKit + Firebase Storage + Cloud Functions)

- **Proxy Architecture**: Master media files reside permanently in Firebase Cloud Storage. ImageKit acts as an external Web Folder origin (`https://storage.googleapis.com/<bucket>/`), intercepting requests to perform real-time resizing, WebP/AVIF compression, and global CDN delivery. That Google Cloud Storage URL is authorized by bucket IAM, not by `firebase/storage.rules`. Shop-category images are stored under `categories/` and follow the same path (`NgOptimizedImage` → ImageKit, then `buildStorageUrl()` on failure). Public `allow read` in storage rules only covers Firebase SDK and `firebasestorage.googleapis.com` reads (today, `/hero` only). Do not add public Storage-rule reads for `categories/`, `products/`, or `brands/` to unblock storefront images.
- **Environment Isolation**:
  - **Dev (`environment.ts`)**: `https://ik.imagekit.io/atteyastore/dev/` fetching from `atteya-store-dev.firebasestorage.app`.
  - **Prod (`environment.prod.ts`)**: `https://ik.imagekit.io/atteyastore/` fetching from `attiya-store.firebasestorage.app`.
  - Dev uploads, previews, and tests never collide with or affect production assets or cache.
- **Angular Image & Fallback Standards**:
  - Provided via `provideImageKitLoader(environment.imageKitUrl)` in `app.config.ts`.
  - **Strictly use `NgOptimizedImage` (`[ngSrc]`) paired with `AppImageFallbackDirective` (`[appImageFallback]`)** for all storefront and preview media. Raw `<img [src]>` for media assets is banned.
  - `[appImageFallback]` automatically renders a monochrome `.skeleton` shimmer while loading and fails over once to `buildStorageUrl()` if ImageKit CDN fails or is still syncing.
  - Never build Storage or ImageKit URLs by hand; always use `normalizeImageKitPath()`, `buildImageKitUrl()`, and `buildStorageUrl()` from `@shared/utils/image`.
- **Media Uploads, Galleries & Validation**:
  - Use `ImageAssetSchema` / `ImageGallerySchema` (`@shared/schemas`) with required SEO alt text (max 125 chars) and raster formats only (JPG, PNG, WebP, AVIF — SVG is banned).
  - Use `<app-image-picker>` (`@shared/ui/image-picker`) for single images and `<app-image-gallery-editor>` (`@shared/ui/image-gallery-editor`) for multi-image galleries (max 8 images, index 0 = Main image, pre-generated ID folder `products/<productId>`).
  - Use `ImageSourceService` (`@core/services/storage`) for validating uploads, probing ImageKit via CORS-safe `new Image()`, and importing external web links via the `importImageFromUrl` Callable Cloud Function (`functions/`).
  - Track uncommitted session uploads per draft using `StorageAssetTracker` (`@core/services/storage`).
- **Skeleton Placeholders vs Blocking Spinners**:
  - Use `<app-skeleton>` (`@shared/ui/skeleton`) or `.skeleton` for layout/content placeholders (`@defer` placeholders, `resource.isLoading()` cards/lists/text) to prevent Cumulative Layout Shift (CLS).
  - Reserve `<mat-progress-spinner>` and `<app-loader>` for active button actions or blocking overlays.

### Storefront motion (GSAP)

- `app-navigation-list-section` is the first storefront GSAP animation. Load `gsap` inside `afterNextRender` (never during server rendering), scope tweens with `gsap.context` on the component host, and `revert()` that context on destroy.
- The server HTML marks the first link active. Photos mount only after the browser confirms the desktop layout, so a phone never requests them. Once that panel is up, CSS shows the first photo until GSAP runs. `prefers-reduced-motion` swaps instantly with no scale. See `reusable-catalog` for the inputs, the `settings/home.navList` field, and the `.nav-list*` classes.

### 📝 Living Documentation Directive

- All agent documentation (`AGENTS.md`, `.agents/skills/`, `.cursor/rules/`) is a living contract. Skills stay in `.agents/skills/` (Cursor loads that folder). Only Cursor-specific files live in `.cursor/`: the design-system rule, and the `ask`, `sync-docs`, and `teacher` skills (Cursor does not load `.agents/workflows`).
- Any new technology, service, utility, or architectural pattern added must be documented immediately in the relevant `.agents/skills/` files (`reusable-catalog`, `new-feature`, etc.) and `AGENTS.md` before concluding the task.

---

## 🧠 3. Specialized Skills

Activate the dedicated skills from `.agents/skills/` on demand. `sync-docs`, `ask`, and `teacher` live in `.cursor/skills/` because Cursor does not load workflow files:

- **`new-feature`** for the end-to-end feature lifecycle, LIFT folder structure, and orchestration.
- **`reusable-catalog`** for the living index of shared UI components, extracted Tailwind classes, and the "2+ Duplication Rule".
- **`ui-design-rules`** for the Component Decision Matrix (Shared UI vs Material vs Tailwind), monochrome identity, and token rules.
- **`quality-standards`** for A11y guardrails (no fake buttons), ReDoS prevention, and SSR server route registration.
- **`code-review`** (Pre-Flight Beast Mode Gate) for `npm run preflight` automated audit and the 7-Point Quality Gate before shipping.
- **`angular-developer`** for architecture, components, signals, forms, DI, HTTP, and routing.
- **`design-system`** for Tailwind v4, Material M3 token overrides, and style partial workflows.
- **`typescript`** for strict types, Valibot schemas, pure models, and logic utilities.
- **`sync-docs`** to audit recent changes and keep living catalogs in sync.
- **`ask`** (manual) for discussion-only brainstorming without file edits.
- **`teacher`** (manual) to guide implementation instead of writing the solution.
