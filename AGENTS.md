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

`withComponentInputBinding()` is **enabled** in `app.config.ts`, so route state flows into components as signals — no `ActivatedRoute` plumbing.

- **Route data is an `input()`**: path params, matrix params, query params, static `data`, and resolver output all bind to matching input names (`readonly id = input.required<string>();`).
- **Precedence on duplicate keys** (lowest to highest): query params -> path/matrix params -> static route `data` -> resolver data.
- **`ActivatedRoute` is the exception**: reach for it only inside guards/resolvers or when parent/child route state is needed. Never inject it just to read route params.
- **Lazy by default**: prefer `loadComponent` / `loadChildren` for feature routes.

### 🎨 Design System & Styling

- **The Contract**: Governed strictly by `.agents/rules/design-system.md` (auto-loaded for `.html`, `.css`, `.scss`, and `.ts`). Adhere to all semantic tokens, M3 overrides, `<mat-icon name="icon" />` with `SharedIconModule`, and utility extraction rules.
- **The Reference**: Activate the **`design-system`** skill for the styling directory map, token registration, Material overrides, and component APIs.

### 🛡️ Data Validation (active) & Firebase (target state)

- **Strict Validation — ACTIVE**: `valibot` is installed and in use (`src/app/shared/schemas/`, `src/app/shared/ui/status-badge/status.model.ts`). Pipe all external data through a schema (`v.parse()` / `v.safeParse()`) before use. See the **`typescript`** skill for the schema rules.

> [!IMPORTANT]
> **Native Firebase JS SDK (`firebase`) is standard.** Do NOT install or use `@angular/fire`. Native Firebase SDK functions (`getDoc`, `signInWithEmailAndPassword`, `onSnapshot`) are framework-agnostic, take explicit instances, and do NOT require an Angular injection context or `runInContext()` wrappers.

- **Signals Integration**: Feed native Firebase promises and `onSnapshot` listeners directly into Angular Signals (`signal()`, `computed()`) or `resource()`. Signal updates trigger zoneless change detection automatically.
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

- **`angular-developer`** for architecture, components, signals, forms, DI, HTTP, and routing.
- **`design-system`** for Tailwind v4, Material M3 token overrides, and UI components.
- **`typescript`** for strict types, Valibot schemas, pure models, and logic utilities.
- **`code-review`** for Beast Mode quality audits and architectural checks.
- **`sync-i18n`** for synchronizing Transloco locale keys (`en.json`, `ar.json`).
