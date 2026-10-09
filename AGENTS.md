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

- **The Contract**: Governed strictly by `.agents/rules/design-system.md` (auto-loaded for `.html`, `.css`, `.scss`, and `.ts`). Adhere to all semantic tokens, M3 overrides, `<mat-icon name="icon" />` with `SharedIconModule`, and utility extraction rules.
- **Zero Tailwind on Angular Material**: Angular Material components (`button[matButton]`, `button[matIconButton]`, `<mat-icon>`, `<mat-menu>`, `<mat-drawer>`, etc.) are already fully styled by the M3 theme. **NEVER** apply Tailwind styling, color, transition, or hover classes to Material components. Only style **native HTML elements** (`<div>`, `<nav>`, `<section>`, `<ul>`, `<a>`, etc.) unless explicitly instructed by the user.
- **Monochrome (Black & White) Identity**: Brand aesthetic is strictly Black & White. `primary` is black; default text is naturally `text-on-surface` (inherited from `body`). **NEVER write `text-on-surface` on any element** — it is already the default inherited color and writing it is banned as redundant class bloat. Never add redundant child color overrides (e.g. `<span class="text-primary">.</span>`), and inherit colors cleanly.
- **Strict Typography Scale**: Only use Material M3 typography tokens (`font-display-*`, `font-headline-*`, `font-title-*`, `font-body-*`, `font-label-*`). Never mix arbitrary Tailwind font sizes (`text-xs`, `text-sm`, `text-3xl`) or weights (`font-medium`, `font-semibold`, `font-black`). To make text bold, **always use `font-bold!`** (with trailing `!` to override the M3 `font:` shorthand).
- **The Reference**: Activate the **`design-system`** skill for the styling directory map, token registration, Material overrides, and component APIs.

### 🛡️ Data Validation (active) & Firebase (target state)

- **Strict Validation — ACTIVE**: `valibot` is installed and in use (`src/app/shared/schemas/`, `src/app/shared/ui/status-badge/status.model.ts`). Pipe all external data through a schema (`v.parse()` / `v.safeParse()`) before use. Use `createValibotConverter()` for Firestore documents. See the **`typescript`** skill for the schema rules.

> [!IMPORTANT]
> **Native Firebase JS SDK (`firebase`) is standard.** Do NOT install or use `@angular/fire`. Native Firebase SDK functions (`getDoc`, `signInWithEmailAndPassword`, `onSnapshot`) are framework-agnostic, take explicit instances, and do NOT require an Angular injection context or `runInContext()` wrappers.

- **Signals & Resources Integration**:
  - One-off reads (`getDoc`, `getDocs`): Feed directly into `resource()`.
  - Dynamic queries: Feed `onSnapshot` into `rxResource()`.
  - Static query listeners: Use `signalCollection()` or `signalDoc()`.
  - Updates automatically trigger zoneless change detection.
- **Query Efficiency**: Always apply `limit(n)` on list queries and use `getCountFromServer()` for counts.
- **Pagination**: Use cursor-based pagination. Only `PaginationServiceInterface<T>` exists today (`src/app/shared/ui/reusable-table/table.model.ts`); a concrete `PaginationService` still has to be written.

- **LIFT Structure**: Feature modules live in `src/app/features/[feature-name]/`. Co-locate template and style files inside `<name>/<name>.component.*`. Do NOT generate or write `.spec.ts` test files.
- **SEO Metadata**: Inject and configure `SeoService` ONLY inside top-level Route/Page components in `ngOnInit()`.
- **Performance (@defer)**:
  - Below-the-fold content: `@defer (hydrate on viewport)`.
  - Completely static content: `@defer (hydrate never)`.
  - Above-the-fold / Hero / LCP content: Do NOT defer.

---

## 🧠 3. Specialized Skills

Activate the dedicated skills from `.agents/skills/` on demand:

- **`new-feature`** for the end-to-end feature lifecycle, LIFT folder structure, and orchestration.
- **`reusable-catalog`** for the living index of shared UI components, extracted Tailwind classes, and the "2+ Duplication Rule".
- **`ui-design-rules`** for the Component Decision Matrix (Shared UI vs Material vs Tailwind), monochrome identity, and token rules.
- **`quality-standards`** for A11y guardrails (no fake buttons), ReDoS prevention, and SSR server route registration.
- **`code-review`** (Pre-Flight Beast Mode Gate) for `npm run preflight` automated audit and the 7-Point Quality Gate before shipping.
- **`angular-developer`** for architecture, components, signals, forms, DI, HTTP, and routing.
- **`design-system`** for Tailwind v4, Material M3 token overrides, and style partial workflows.
- **`typescript`** for strict types, Valibot schemas, pure models, and logic utilities.
