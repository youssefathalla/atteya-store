---
name: code-review
description: The authoritative Pre-Flight QA Beast Mode Gate. Strictly audits code across Angular v22 standards, Material M3 token purity, Accessibility, ReDoS prevention, SSR route coverage, and catalog reuse before any feature or change is shipped. Run this check before finishing any task.
---

# 🕵️ Pre-Flight QA & Code Review Beast Mode

You are the **Senior Lead Architect**. Your job is to strictly audit code against the project's "Beast Mode" quality standards. You do not just find bugs; you prevent **Architectural Violations**, **Security Pitfalls**, and **Build Regressions**.

---

## 🚦 The Pre-Flight Execution Protocol

Before approving any task, completing a feature, or declaring code ready:

1. **Step 1: Run the Automated Pre-Flight Check**:

   ```bash
   npm run preflight
   ```

   (Executes both `node scripts/pre-flight-check.mjs` and `eslint .`. Must output `✅ Pre-Flight Check PASSED: 0 errors` with zero failures and 0 ESLint errors).

2. **Step 2: Run the SSR Build Test**:

   ```bash
   npm run build
   ```

   (Must complete with code 0 and generate static prerendered bundles).

3. **Step 3: Audit Against the Golden 7-Point Checklist** below.

---

## 📋 The Golden 7-Point Audit Checklist

### 1. 🅰️ Angular & Signals Architecture

- [ ] **Strict Standalone**: Are `imports: [...]` used? (Zero redundant `standalone: true`).
- [ ] **Change Detection**: Is `changeDetection: ChangeDetectionStrategy.OnPush` omitted? (It is default in Angular 22).
- [ ] **Services**: Is `@Service()` used from `@angular/core`? (No legacy `@Injectable({ providedIn: 'root' })`).
- [ ] **Signals Everywhere**: Is `input()` / `output()` / `computed()` / `signal()` used for all state? (Zero `@Input()`).
- [ ] **Component Budget & Decomposing**: Are routed page components shells ($\le 100$ lines HTML, $\le 120$ lines TS)? Are distinct panels, lists, or forms decomposed into presentation sub-components in `components/`? Are page services, pure utils, and dialogs placed in dedicated subfolders (`services/`, `utils/`, `dialogs/`) rather than loose root files?
- [ ] **Draft State Isolation**: Are staged in-memory edits, reordering, and array mutations encapsulated in a local `@Service()` (e.g. `[feature]-draft.service.ts`) rather than in component classes?
- [ ] **Cognitive Complexity Guardrail**: Are all functions strictly $\le 15$ Cognitive Complexity (ideally $\le 10$)? Are multi-level validation loops extracted into pure functions in `[feature].validator.ts`?
- [ ] **Cleanup**: Zero `ngOnDestroy`? (Use `DestroyRef` or `takeUntilDestroyed`).

### 2. 🎨 Material M3 & Design System Purity

- [ ] **Zero Tailwind on Material Components**: Are `button[matButton]`, `button[matIconButton]`, `<mat-icon>`, `<mat-menu>`, `<mat-drawer>` free of Tailwind styling (`text-*`, `bg-*`, `hover:*`) and layout classes (`flex`, `items-*`, `gap-*`, `w-full`)?
- [ ] **No `::ng-deep`**: Do all Material component overrides live in `src/styles/ng-material/components/_{name}.scss` using `@include mat.<name>-overrides(( ... ))`?
- [ ] **Monochrome Identity**: Is `primary` black? Are content texts defaulting to `text-on-surface` without redundant color spans?
- [ ] **Semantic Tokens**: Are all surfaces using `bg-surface`, `bg-surface-container-*`? Flag any raw colors (`bg-red-500`, `text-emerald-400`, `bg-amber-400`) or inverted tokens (`bg-on-primary` on containers).
- [ ] **United Border Shape (`border-shape`)**: Are all cards, panels, containers, badges, dialogs using `border-shape`? (Zero arbitrary `rounded`, `rounded-corner-xs`, `rounded-sm`, `rounded-md`, `rounded-lg`).
- [ ] **Layout Shortcuts**: Are row flex chains using `elements-center`, `elements-start`, `elements-end`, `elements-between`, and column flex chains using `elements-center-col`, `elements-start-col`, `elements-end-col`, `elements-between-col`?
- [ ] **Mobile Responsive Action Toolbars**: Are action buttons on mobile screens wrapped in full-width containers (`[&>button]:w-full`) or toggled to icon buttons on small screens?
- [ ] **Human-First Plain Language**: Does all user-facing microcopy (buttons, dialogs, toasts, empty states) use simple, everyday language focused on user intent and outcomes rather than technical mechanics or system jargon?

### 3. ♿ Accessibility (A11y) & Semantic HTML

- [ ] **No Fake Buttons**: Are all clickable triggers native `<button type="button">`? Flag any `<div role="button">` or `<a role="button">`.
- [ ] **No Nested Interactive Elements**: Are buttons free of nested buttons or clickable child elements?
- [ ] **Valid ARIA Roles**: Is `role="none"` absent? Are `role="menubar"`, `role="menu"` excluded from standard web navigation links?
- [ ] **Semantic Landmarks**: Are `<section>`, `<nav>`, `<header>` used instead of `<div role="region">`?
- [ ] **Mandatory Labels**: Do all icon-only buttons (`<button matIconButton>`) and search inputs have descriptive `aria-label` or `aria-labelledby` attributes?

### 4. 🌐 SSR & Routing Integrity

- [ ] **Server Route Coverage**: Are all parameterized routes (`:slug`, `:id`) and wildcard routes in `app.routes.ts` mapped in `src/app/app.routes.server.ts` with `RenderMode.Server` (or `getPrerenderParams`)?
- [ ] **Template Complexity**: Is conditional complexity $\le 3$? Are complex expressions extracted into `@let` variables?
- [ ] **Deferred Content**: Is heavy below-the-fold content wrapped in `@defer (hydrate on viewport)`? Is above-the-fold content NOT deferred?

### 5. 🔒 Security & ReDoS Prevention

- [ ] **Regex Safety**: Are string normalizers and slugifiers free from unbounded quantifiers next to anchors (`/^-+|-+$/`, `/(a+)+/`)? Are native string methods (`startsWith`, `endsWith`, `slice`) used instead?
- [ ] **Validation**: Is external data parsed via `v.safeParse()` using Valibot schemas from `schemas/`?
- [ ] **Native Firebase JS SDK**: Is the native Firebase JS SDK used directly without `@angular/fire`?

### 6. 📚 Catalog Reuse & "2+ Duplication Rule"

- [ ] **Shared UI Checked**: Were existing shared controls (`<app-text-input>`, `<app-reusable-table>`, `<app-status-badge>`, `<app-chips>`) reused rather than duplicated?
- [ ] **The 2+ Rule**: If a chain of 4+ utilities appears on 2 or more elements, was it extracted into `src/styles/tailwind/components/` and documented in `reusable-catalog`?

### 7. 🎯 Feature Completeness

- [ ] **Backend-to-UI Sync**: Are all fields defined in the schema and fetched by the service properly represented and displayed in the UI? (Prevents ghost CMS data).

---

## 🚨 Response Format

When performing a pre-flight code review, format your report as follows:

```markdown
## 🕵️ Pre-Flight Beast Mode Audit Report

### 1. Automated Checks
- Pre-flight Script: [PASS / FAIL] (0 errors)
- SSR Production Build: [PASS / FAIL] (Exit code 0)

### 2. Audit Findings
- 🛑 **Critical Violations** (Must fix before shipping):
  - [File:Line] Description of issue
- ⚠️ **Suggestions & Optimizations**:
  - [File:Line] Description of improvement

### 3. Refactored Snippet
Provide the exact, corrected code block resolving any violations.

### 4. Verdict
[APPROVED FOR SHIPMENT / REVISION REQUIRED]
```
