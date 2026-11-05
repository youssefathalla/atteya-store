---
name: quality-standards
description: Enforces strict Accessibility (A11y), Security, ReDoS (polynomial backtracking prevention), and SSR runtime standards in Atteya Store. Use to ensure compliance before writing or shipping code.
---

# 🛡️ Quality Standards: A11y, Security, ReDoS & SSR

This skill defines the non-negotiable **engineering quality standards** for Atteya Store.
Any violation of these rules will trigger build failures, linter errors, or security risks.

---

## ♿ 1. Accessibility (A11y) Guardrails

### 🚫 The "No Fake Buttons" Rule

- **FORBIDDEN**: Never assign `role="button"` to non-interactive elements (`<div>`, `<span>`, `<a>`, `<li>`).
  - ❌ `<div role="button" (click)="toggle()">...</div>`
  - ❌ `<a role="button" (click)="open()">...</a>`
- **MANDATORY**: Always use native `<button>` elements with an explicit `type="button"`.
  - ✅ `<button type="button" (click)="toggle()">...</button>`
  - Why? Native buttons support keyboard focus (`Tab`), activation (`Enter`, `Space`), and accessibility APIs without custom `(keydown)` handlers.

### 🚫 No Nested Interactive Elements

- An interactive element must **never** be placed inside another interactive element:
  - ❌ A `<button matIconButton>` inside another `<button>`.
  - ❌ An `<a>` link inside a `<button>`.
  - ❌ A checkbox inside a clickable list row that also triggers navigation.

### 🏷️ Valid ARIA Roles Only

- **Ban `role="none"`**:
  - `role="none"` is an abstract ARIA role and triggers accessibility linters. Remove it completely. Use semantic HTML without roles.
- **Do NOT use `role="menubar"`, `role="menu"`, or `role="menuitem"` on Web Links**:
  - Web site navigation bars (like header category links) are document navigation landmarks (`<nav>`, `<ul>`, `<li>`, `<a>`).
  - `role="menubar"` is reserved for desktop application menus (like File, Edit, View in Google Docs) and alters screen reader arrow key navigation.
- **Semantic Landmarks over `role="region"`**:
  - ❌ `<div role="region" aria-label="Filters">`
  - ✅ `<section aria-label="Filters">` or `<nav aria-label="Main Navigation">`

### 📢 Mandatory Labels

- Every icon button (`<button matIconButton>`) **must** have an `aria-label` or `aria-labelledby`:
  - ❌ `<button matIconButton><mat-icon name="close" /></button>`
  - ✅ `<button matIconButton aria-label="Close dialog"><mat-icon name="close" /></button>`
  - ✅ `<button matIconButton [attr.aria-labelledby]="titleId"><mat-icon name="close" /></button>`
- Every search input must have `aria-label="Search products"`.
- Every modal or drawer close button must have a clear `aria-label`.

---

## 🔒 2. Security & ReDoS Prevention

### 💥 ReDoS (Regular Expression Denial of Service)

Unbounded quantifiers paired with anchors (`^`, `$`) or nested repetitions cause **super-linear or exponential polynomial backtracking**, which can freeze the browser or server.

- **BANNED Patterns**:
  - ❌ `/^-+|-+$/g` (unbounded hyphens at start/end)
  - ❌ `/([a-z]+)+/` (nested quantifiers)
  - ❌ `/.*[a-z]+.*/` (overlapping match patterns)
- **SAFE Pattern: Native String Slicing**:
  - When trimming hyphens or special characters from strings (e.g. slugification), replace regex with $O(1)$ string operations:

  ```typescript
  // Fast, safe O(1) trimming without regex backtracking
  let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  while (slug.startsWith('-')) slug = slug.slice(1);
  while (slug.endsWith('-')) slug = slug.slice(0, -1);
  ```

### 🛡️ External Input Sanitization

- All external parameters, route params, query params, and Firestore data must be parsed through Valibot schemas:

  ```typescript
  const result = v.safeParse(ProductSchema, rawData);
  if (!result.success) {
    // Handle error gracefully
  }
  ```

---

## ⚡ 3. SSR & Prerender Standards

### 🌐 Dynamic Route Server Configuration (`src/app/app.routes.server.ts`)

Angular SSR statically prerenders routes at build time (`npm run build`).

- **The Rule**: Any route containing route parameters (e.g. `path: 'category/:slug'`) or wildcards (`**`) in `app.routes.ts` or any feature route file (`**/*.routes.ts`) **MUST** be explicitly declared in `src/app/app.routes.server.ts` with `RenderMode.Server` or `RenderMode.Client` (or provide `getPrerenderParams`).
- If you add a new parameterized route (e.g. `path: 'product/:id'`):

  ```typescript
  // src/app/app.routes.server.ts
  {
    path: 'product/**',
    renderMode: RenderMode.Server,
  }
  ```

- **Failure to do this will crash `npm run build` during static prerendering!**

### 🧠 Template Complexity Limit ($\le 3$)

- Angular template conditional complexity should never exceed 3 logical operations in a single expression.
- Use the modern `@let` syntax to simplify expressions:

  ```html
  <!-- BAD: Complexity > 3 -->
  @if (user && user.isAdmin && category.subCategories && category.subCategories.length > 0) { ... }

  <!-- GOOD: Clean, cached, zero overhead -->
  @let hasSubCategories = (category.subCategories?.length ?? 0) > 0;
  @let canManage = user()?.isAdmin && hasSubCategories;
  @if (canManage) { ... }
  ```

### 🚀 Deferred Rendering (`@defer`)

- **Below-the-fold content** (e.g. related products, reviews, footer):
  - `@defer (hydrate on viewport) { <app-reviews /> } @placeholder { <div class="min-h-40" /> }`
- **Completely static / decorative content**:
  - `@defer (hydrate never) { <app-decorative-mesh /> }`
- **Above-the-fold / Hero / LCP**:
  - **Never defer** hero banners or top navigation (causes layout shift and hurts Core Web Vitals).
