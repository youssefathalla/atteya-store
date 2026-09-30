# 🤖 AI Agent Master Guide

This repository contains a production-grade **Angular v22+ (Zoneless, Signal-First)** application with **Tailwind CSS v4** and **Angular Material M3**.
Adhere strictly to these core directives to ensure maximum performance, clean architecture, and seamless collaboration.

---

## 🧠 1. Core Architectural Directives

### 🅰️ Angular & Signals (Strict Modern Standards)

- **Signal-First Reactivity**: Use `signal()`, `computed()`, and `effect()`. Zero Zone.js dependencies (`fakeAsync`, `tick` are forbidden).
- **Inputs & Outputs**: Use `input()` / `input.required()` and `output()`. No legacy `@Input` or `@Output`.
- **Control Flow**: Modern template syntax only (`@if`, `@for`, `@let`, `@switch`). No `*ngIf` or `*ngFor`.
- **Standalone by Default**: Do not write `standalone: true` or `changeDetection: ChangeDetectionStrategy.OnPush` (these are default).
- **Services**: Use `@Service()` from `@angular/core` instead of legacy `@Injectable({ providedIn: 'root' })`.
- **Forms**: Prefer Signal Forms for modern state management.
- **Deep Reference**: Activate the **`angular-developer`** skill for detailed code generation, directives, and HTTP/Signals workflows.

### 🧭 Routing & Route Data

`withComponentInputBinding()` is **enabled** in `app.config.ts` (and mirrored in `src/test-providers.ts`), so route state flows into components as signals — no `ActivatedRoute` plumbing.

- **Route data is an `input()`**: path params, matrix params, query params, static `data`, and resolver output all bind to matching input names.

  ```typescript
  // route: { path: 'users/:id', loadComponent: ... }
  readonly id = input.required<string>();       // from :id
  readonly page = input(1, { transform: numberAttribute }); // from ?page=
  ```

- **Precedence on duplicate keys** (lowest to highest): query params -> path/matrix params -> static route `data` -> resolver data. Resolvers always win.
- **Unmatched keys become `undefined`**: the router clears an input when its key disappears from the route rather than keeping the old value. A removed query param resets the input. Because of this, `input.required<T>()` can hold `undefined` at runtime despite its type — use it only where the path guarantees the segment (`:id`), and use `input()` with a default or `transform` for anything optional.
- **`ActivatedRoute` is the exception, not the default**: reach for it only where inputs cannot reach — inside a `ResolveFn` or guard (`route.paramMap`), or when you need parent/child route state. Never inject it just to read your own `:id`.
- **Lazy by default**: prefer `loadComponent` / `loadChildren` for feature routes.

### 🎨 Design System & Styling

Two layers, no overlap:

- **The contract** — `.agents/rules/design-system.md`. Loads automatically for `.html`, `.css`, `.scss` and `.ts` (a third of this project's components use inline templates, so styling rules must travel with TypeScript too). Owns the token vocabulary and the hard bans.
- **The reference** — the **`design-system`** skill. Activate it for styling work, UI audits, or anything touching `src/styles/`. Owns the directory map, Material override workflow, style-file registration, and per-component input reference.

The non-negotiables, repeated here because this guide is always in context:

- **Tailwind v4**: config-less. Suffix `hidden!` (never prefix `!hidden`), `bg-black/50` (never `bg-opacity-50`), `size-{N}` (never `w-N h-N`), semantic tokens only (never `bg-red-500` / `text-white`).
- **Material 3 Overrides**: `@include mat.<component>-overrides(( ... ))` under `src/styles/ng-material/components/`. No `::ng-deep`, no component CSS on Material internals.
- **Icons**: `<mat-icon name="home" />` plus `SharedIconModule` (from `@shared/ui/mat-icon`) in the component `imports` — without it the icon renders nothing. Content projection is forbidden.
- **Reuse First**: check `src/app/shared/ui|directives|pipes/` and verify inputs against the component source before writing anything new.

### 🛡️ Data Validation (active) & Firebase (target state)

- **Strict Validation — ACTIVE**: `valibot` is installed and in use (`src/app/core/schema/`, `src/app/shared/ui/status-badge/status.model.ts`). Pipe all external data through a schema (`v.parse()` / `v.safeParse()`) before use. See the **`typescript`** skill for the schema rules.

> [!IMPORTANT]
> **Firebase is NOT wired up yet.** There is no `firebase` / `@angular/fire` dependency, and `src/app/core/services/auth/auth.service.ts` is fully commented out. Treat the rules below as the **target architecture** for when it lands — do not report their absence as a violation, and confirm with the user before installing anything.

- **Injection Context**: Use `runInContext()` from `@shared/utils/injection.utils` for AngularFire calls inside async callbacks. It is a factory: build the runner in an injection context, then call it.

  ```typescript
  readonly #run = runInContext(); // field initializer = injection context
  // later, inside an async callback:
  const snapshot = await this.#run(() => getDocs(query));
  ```

- **Query Efficiency**: Always apply `limit(n)` on list queries and use `getCountFromServer()` for counts.
- **Pagination**: Use cursor-based pagination. Only `PaginationServiceInterface<T>` exists today (`src/app/shared/ui/reusable-table/table.model.ts`); a concrete `PaginationService` still has to be written.

### 🧪 Testing Standards (Vitest Native)

- **Framework**: Official Angular Vitest builder (`@angular/build:unit-test`) + `jsdom`. Run via `npm test` / `ng test` — no `--run` flag (that is a raw-Vitest flag the builder does not accept). `watch` is pinned to `false` in `angular.json`, so a single run is the default and agents will not hang. Pass `--watch` explicitly for interactive use.
- **Philosophy**: Test _behavior_ using Component Harnesses, `async/await`, and `fixture.detectChanges()`.
- **Strict Hard Block**: DO NOT install `@analogjs/vite-plugin-angular` or `vite-tsconfig-paths` (they will break the native build).

---

## 🏛️ 2. Project Conventions & Reusability

- **Reusability First (DRY)**: ALWAYS inspect these before building any new component, directive, pipe, or utility:
  - `src/app/shared/ui/` -> components & directives (icons, cards, forms, chips, badges, table, dialogs, loader, logo)
  - `src/app/shared/directives/` -> `horizontal-scroll`, `template-type`
  - `src/app/shared/pipes/` -> `pence-to-pounds`, `timestamp-date`
  - `src/app/shared/utils/` -> `date`, `id`, `injection`, `stepper-orientation`, `firebase/`
  - `src/app/core/services/` -> app-wide services (seo, theme, logger, snack-bar, loading, maps, icons, i18n)
- **Path Aliases**: Import via `@shared/*`, `@core/*`, `@features/*`, `@env/*` (defined in `tsconfig.json`). NEVER use deep relative paths (`../../../`).
- **Verify Inputs Against Source**: Before binding to any shared component, open it and read its `input()` / `model()` declarations. Do not infer input names from similar libraries.
- **LIFT Structure**: Feature modules live in `src/app/features/[feature-name]/`. Co-locate template, style, and spec files inside `<name>/<name>.component.*`.
- **SEO Metadata**: Inject and configure `SeoService` ONLY inside top-level Route/Page components in `ngOnInit()`.
- **Performance (@defer)**:
  - Below-the-fold content: `@defer (hydrate on viewport)`.
  - Completely static content: `@defer (hydrate never)`.
  - Above-the-fold / Hero / LCP content: Do NOT defer.

---

## 🧠 3. Skill Routing

Route requests to the appropriate specialized workspace or plugin skill:

| User Intent & Task Domain                                                                                       | ⏩ Activate Skill       |
| :-------------------------------------------------------------------------------------------------------------- | :---------------------- |
| **Angular Development**: Components, signals, linkedSignal, resource, HTTP, forms, routing, DI, SSR, tests      | **`angular-developer`** |
| **UI & Design System**: Tailwind v4, Material M3 token overrides, shared UI catalog, styling audits             | **`design-system`**     |
| **Global State**: SignalStore, deep signal state, global application data _(`@ngrx/signals` not installed yet)_ | **`ngrx-signal-store`** |
| **TypeScript & Data**: Strict types, Valibot schemas, pure models, logic utils                                  | **`typescript`**        |
| **Code Review & QA**: Beast Mode architectural audits, quality checks, optimization                             | **`code-review`**       |
| **Internationalization**: Sync translations (`en.json`, `ar.json`)                                              | **`sync-i18n`**         |

### Rules & Workflow Modes (`.agents/rules/`, `.agents/workflows/`)

| File               | Activation                             | Effect                                                         |
| :----------------- | :------------------------------------- | :------------------------------------------------------------- |
| `design-system.md` | Auto on `**/*.{html,css,scss}`         | Injects the condensed styling contract while editing UI files. |
| `translater.md`    | Auto when the request is a translation | Transloco key extraction + `en.json` / `ar.json` updates.      |
| `ask.md`           | Manual -> `#ask`                       | Discussion mode: read-only, no file edits.                     |
| `teacher.md`       | Manual -> `#teacher`                   | Teacher mode: guidance only, no complete implementations.      |

> `ask` and `teacher` deliberately suppress code generation. They are **manual-only** and must never be set to always-on inclusion, or they will conflict with the directives above.

### Agent Documentation

`.agents/` is the single source of truth for all agent skills (`.agents/skills/`), rules (`.agents/rules/`), and workflows (`.agents/workflows/`).
Keep each layer in its lane: put vocabulary and bans in rules, workflows in workflows, and architecture and API reference in skills. Do not restate one in the other.
