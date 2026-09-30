---
name: design-system
description: The Design Authority for styling and UI. Enforces strict Tailwind v4 + Angular Material M3 token overrides, shared UI component usage, and custom class extraction rules.
---

# 🎨 Design System & UI Architecture

This skill is the **Design Authority** for the project: the architecture, workflows and full component reference behind the design system.

> **Division of responsibility.** The token vocabulary and hard bans live in `.agents/rules/design-system.md`, which loads automatically for `.html`, `.css`, `.scss` and `.ts` files. This skill carries what that contract deliberately omits: the style directory map, the Material override workflow, style-file registration, per-component input reference, and the audit checklist. The two compose — do not duplicate content between them.

---

## 🏗️ 1. Directory Structure & Architecture

```text
src/
├── styles.scss                         # SCSS ENTRY: mat.theme() + @use 'ng-material' | 'base' | 'fonts'
├── tailwind.css                        # TAILWIND ENTRY: @import theme, components-base, each components/*, utils-base
├── styles/
│   ├── _base.scss                      # Global root overrides (progress bar, scrollbars, html/body)
│   ├── _fonts.scss                     # Font family imports
│   ├── ng-material/                    # Angular Material M3 Design Token Overrides
│   │   ├── _index.scss                 # Master barrel export importing all component overrides
│   │   └── components/
│   │       ├── _accordion.scss         # mat.expansion-overrides, mat.checkbox-overrides
│   │       ├── _buttons.scss           # mat.button-overrides, mat.fab-overrides, spinner gap
│   │       ├── _cards.scss             # mat.card-overrides
│   │       ├── _dialog.scss            # mat.dialog-overrides, backdrop blurs
│   │       ├── _icons.scss             # mat.icon-overrides, mat.list-overrides, iconColor mappings
│   │       ├── _list-items.scss        # mat.list-overrides
│   │       ├── _sidenav.scss           # mat.sidenav-overrides
│   │       ├── _snackbars.scss         # mat.snack-bar-overrides for status snackbars
│   │       ├── _status.scss            # Theme palettes ([theme="..."]) and status badges
│   │       ├── _stepper.scss           # ⚠️ EXCEPTION: scoped layout fix on mat-stepper internals (no override mixin exists for it)
│   │       ├── _table.scss             # mat.table-overrides, .dashboard-table
│   │       └── _toolbar.scss           # mat.toolbar-overrides, toolbar headers
│   └── tailwind/                       # Tailwind CSS v4 System
│       ├── theme.css                   # Theme tokens (@theme) mapping to Material sys variables
│       ├── components-base.css         # Core component layer (.base-card, .form-card, .bg-circle)
│       ├── utils-base.css              # Imports utilities/
│       ├── components/                 # Reusable multi-utility patterns (@layer components)
│       │   ├── images.css              # .image-mask, .hero-image
│       │   ├── overlays.css            # .loading-overlay, .badge-overlay, .icon-overlay
│       │   ├── spacing.css             # .container-content, .hero-space, .section-space
│       │   └── status.css              # .status-badge, .vehicle-status, .chip, .chip-icon-wrapper
│       └── utilities/                  # Single-purpose custom utility definitions (@utility)
│           ├── fonts.css               # font-display-*, font-headline-*, font-title-*, font-body-*, font-label-*, ms-fill
│           ├── layout.css              # elements-center, elements-start, elements-end, elements-between, form-space
│           └── sizing.css              # dvh-10..full, dvh-page-10..full
└── app/shared/                         # Reusable building blocks — CHECK BEFORE WRITING ANYTHING NEW
    ├── ui/                             # UI components & directives
    │   ├── mat-icon/                   # MatIconDirective + SharedIconModule (name, iconColor, size, type, weight)
    │   ├── status-badge/               # StatusBadgeComponent (configuration-driven badge)
    │   ├── chips/                      # ChipsComponent (single-select filter chips)
    │   ├── cards/                      # BaseCardComponent, InfoCardComponent, ReviewCardComponent
    │   ├── forms/                      # Standardized form controls (text-input, password-input, select-input, date-input, location-input, file-input, text-field-input, timepicker)
    │   ├── reusable-table/             # ReusableTableComponent (data table with sorting, filtering, pagination)
    │   ├── dialogs/                    # app-base-dialog (BaseDialogComponent), app-confirm-dialog (ConfirmDialogComponent)
    │   ├── img-preview-dialog/         # Image preview modal
    │   ├── loader/                     # App loader / spinner
    │   └── logo/                       # App branding logo
    ├── directives/                     # horizontal-scroll, template-type (read template-type/USAGE.md)
    └── pipes/                          # pence-to-pounds, timestamp-date
```

### Registering New Style Files

- **New Material component override** -> create `src/styles/ng-material/components/_{name}.scss`, then add `@use 'components/{name}';` to `src/styles/ng-material/_index.scss`.
- **New Tailwind component domain** -> create `src/styles/tailwind/components/{domain}.css`, then add `@import './styles/tailwind/components/{domain}';` to `src/tailwind.css`.
- **New utility** -> add it to the matching file in `src/styles/tailwind/utilities/` (already imported via `utils-base.css`; no registration needed).

---

## 🅰️ 2. Angular Material M3 Overrides Protocol

### The Core Rule: Override via M3 Tokens, NEVER `::ng-deep` or inline hacks

When styling or adjusting an Angular Material component, **ALWAYS** use the official Angular Material M3 override mixins (`@include mat.<component>-overrides(( ... ))`).

Tokens are documented on the official Angular Material site:
👉 **[Angular Material Component Styling Tokens](https://material.angular.dev/components)** (Select Component -> **Styling** tab)

### Override Workflow

1. Check `src/styles/ng-material/components/` for an existing file (e.g. `_buttons.scss`, `_dialog.scss`, `_toolbar.scss`, etc.).
2. If modifying an existing component:
   - Add or update the token in the corresponding `_component.scss` file using `@include mat.<component>-overrides(( token-name: value ))`.
   - Use CSS variables (`var(--mat-sys-primary)`, `var(--mat-sys-corner-xs)`, etc.) or design tokens for values.
3. If styling a **new** Material component (e.g. `mat-tabs`, `mat-slider`, `mat-badge`):
   - Create a new SCSS partial: `src/styles/ng-material/components/_{component-name}.scss`.
   - Add `@use '@angular/material' as mat;` at the top.
   - Add the override block:

     ```scss
     @use '@angular/material' as mat;

     :root {
       @include mat.tabs-overrides(
         (
           active-indicator-color: var(--mat-sys-primary),
           active-label-text-color: var(--mat-sys-primary),
         )
       );
     }
     ```

   - Register the file in `src/styles/ng-material/_index.scss` by adding `@use 'components/{component-name}';`.

### Strict No-Custom-Style Policy on Material Components

Do NOT attach random Tailwind styling or custom CSS onto Angular Material components (`<mat-toolbar>`, `<mat-button>`, `<mat-menu>`, `<mat-list>`, etc.). Rely strictly on:

- Native component inputs (`matButton="filled | outlined | elevated | text"`)
- Thematic attributes (`theme="success | warning | info | error"`)
- Global tokens in `src/styles/ng-material/components/`

### The Single Documented Exception

Some Material internals expose no M3 token (pure layout/spacing of an internal element). In that case — and ONLY then:

1. Confirm on the component's **Styling** tab that no token covers it.
2. Write the rule in the component's **global** partial under `src/styles/ng-material/components/`, scoped to the host element. Never in a component `styles`/`.scss` file, and never with `::ng-deep`.
3. Add a comment explaining which token was missing.

The existing precedent is `_stepper.scss`:

```scss
mat-stepper {
  .mat-horizontal-content-container {
    padding-top: 1rem; // no stepper token exposes content container padding
  }
}
```

Treat this as a last resort, not a pattern to copy freely.

---

## 🌊 3. Tailwind CSS v4 Architecture & Extraction Rules

### The "2+ Duplication Rule" (Component Layer Extraction)

If an element requires a combination of classes (e.g. 4–10 utilities) and that exact pattern is used **more than 1 time** (2+ times), **DO NOT copy-paste the utility chain**.
Extract it into a reusable component class under `src/styles/tailwind/components/`.

- **Where to add:**
  - Layout / Spacing: `src/styles/tailwind/components/spacing.css` (e.g. `.container-content`, `.hero-space`)
  - Images / Media: `src/styles/tailwind/components/images.css` (e.g. `.image-mask`, `.hero-image`)
  - Overlays / Badges: `src/styles/tailwind/components/overlays.css` (e.g. `.loading-overlay`, `.badge-overlay`)
  - Status / Chips: `src/styles/tailwind/components/status.css` (e.g. `.status-badge`, `.chip`)
  - General / Cards / Forms: `src/styles/tailwind/components-base.css` (e.g. `.base-card`, `.form-card`, `.bg-circle`)
  - New domain: Create `src/styles/tailwind/components/<domain>.css` and `@import` it in `src/tailwind.css`.

- **Syntax (Tailwind v4 @layer components):**

  ```css
  @layer components {
    .feature-card {
      @apply block w-full duration-300 border hover:border-primary border-outline-variant rounded-corner-xs shadow-mat-1 p-6 bg-surface-container-low;
    }
  }
  ```

### Utilities vs Components

- **`src/styles/tailwind/utilities/`**: For single-concept, reusable helper utilities using `@utility <name> { ... }`.
  - Layout: `elements-center`, `elements-start`, `elements-end`, `elements-between`, `form-space`
  - Sizing: `dvh-10` ... `dvh-full`, `dvh-page-10` ... `dvh-page-full`
  - Typography: `font-headline-lg`, `font-title-md`, `font-body-md`, `font-label-sm`, `ms-fill`
- **`src/styles/tailwind/components/`**: For composite UI patterns using `@layer components { .class-name { @apply ...; } }`.

### Syntax Rules & Token Vocabulary

Config-less — there is no `tailwind.config.js`. The suffix-`!`, `size-{N}`, slash-opacity and semantic-token rules, plus the full typography / color / utility vocabulary, live in the always-loaded contract at `.agents/rules/design-system.md`. Read it if it is not already in context.

---

## 🧩 4. Reusable Shared UI Components Catalog (`src/app/shared/ui/`)

Before writing any new UI elements, ALWAYS check and reuse existing components from `src/app/shared/ui/`.

### 1. Icons (`MatIconDirective`) — `src/app/shared/ui/mat-icon`

- **Required import** (without it the icon renders nothing — the directive supplies the glyph and size class):

  ```typescript
  import { SharedIconModule } from '@shared/ui/mat-icon';

  @Component({
    imports: [SharedIconModule], // = [MatIconModule, MatIconDirective]
  })
  ```

- **Selector**: `<mat-icon name="..." />`
- **Inputs**:
  - `name`: (Required) Material Symbol name string.
  - `iconColor`: `'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'info'`
  - `size`: `'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl'` (Default: `'2xl'`)
  - `type`: `'outline' | 'fill'` (Default: `'outline'`)
  - `weight`: `'100' | '200' | '300' | '400' | '500' | '600' | '700'` (Default: `'500'`)
- **Rules**:
  - ❌ `<mat-icon>home</mat-icon>` (Content projection forbidden).
  - ❌ `<mat-icon color="primary" />` (Native color input forbidden).
  - ✅ `<mat-icon name="home" />`
  - ✅ `<mat-icon name="check_circle" iconColor="success" type="fill" size="3xl" />`

### 2. Status Badge (`StatusBadgeComponent`) — `src/app/shared/ui/status-badge`

- **Selector**: `<app-status-badge [value]="status" [statusConfig]="statusConfig" />`
- **Inputs**: `value` (required), `statusConfig` (`Record<string, StatusConfig>`), `icon` (overrides the config icon), `bgOpacity` (sets the `--bg-opacity` custom property).
- **Behaviour**: `value` is lowercased before the config lookup, so config keys must be lowercase. Unmatched values fall back to `color: 'primary'`. The label comes from `config.label`, else the title-cased `value`, else projected content.
- **`StatusConfig`**: `{ label?: string; color: 'primary' | 'green' | 'yellow' | 'blue' | 'red' | 'gray'; icon?: string }`
- **Pattern**: Configuration-driven mapping.

  ```typescript
  protected readonly statusConfig: Record<string, StatusConfig> = {
    active: { color: 'green', icon: 'check' },
    pending: { color: 'yellow', icon: 'schedule' },
    banned: { color: 'red', icon: 'block' }
  };
  ```

### 3. Filter Chips (`ChipsComponent`) — `src/app/shared/ui/chips`

Single-select (`role="radiogroup"`) chip group. The selection is a **model input**, so bind it two-way.

- **Selector**: `<app-chips [chips]="categories" [(value)]="selectedCategory" ariaLabel="Filter by category" />`
- **Inputs**: `chips` (required `T[]`), `value` (required, `model<T>` — two-way), `iconSize` (default `'xl'`), `ariaLabel`, plus `hostClass` / `listClass` / `childrenClass` for layout tweaks.
- ❌ `[selected]` / `(selectedChange)` do not exist.

### 4. Cards — `src/app/shared/ui/cards/`

- `<app-base-card>`: Standard bordered surface container with hover elevation and primary border glow.
- `<app-info-card>`: Key-value metric and statistic display card.
- `<app-review-card>`: Customer rating, avatar, testimonial, and feedback presentation.

### 5. Standardized Form Controls — `src/app/shared/ui/forms/`

All controls extend `BaseFormControl<T>` (`src/app/shared/ui/forms/base-form-control.directive.ts`) and are **Signal Forms** based. They read validity, touched, dirty and the first error message off the field themselves — never wire up `mat-error` manually.

- **Inherited inputs**: `formField` (required, `FieldTree<T>` from `@angular/forms/signals`), `label` (required), `appearance` (default `'outline'`), `subscriptSizing` (default `'fixed'`), `placeholder`.
- **Usage** (see `src/app/features/playground/components/forms-tab/` for a full working example):

  ```typescript
  protected readonly formModel = signal({ email: '' });
  protected readonly demoForm = form(this.formModel, (f) => {
    required(f.email);
    email(f.email);
  });
  ```

  ```html
  <app-text-input [formField]="demoForm.email" label="Email" placeholder="you@example.com" />
  ```

  ❌ Never pass `[formControl]`, `[(ngModel)]`, or a raw signal. The input is `[formField]`.

- `<app-text-input>`: Single-line text input with prefix/suffix icons.
- `<app-text-field-input>`: Multi-line textarea form control.
- `<app-password-input>`: Secure password input with visibility toggle.
- `<app-select-input>`: Standardized dropdown select with options array.
- `<app-date-input>`: Material Datepicker integration.
- `<app-location-input>`: Location search and autocomplete input.
- `<app-file-input>`: Drag-and-drop file upload with validation.
- `<app-timepicker>`: Time selection input.

### 6. Data Tables (`ReusableTableComponent`) — `src/app/shared/ui/reusable-table/`

- **Selector**: `<app-reusable-table [data]="data" [columns]="columns" />`
- **Required inputs**: `data` (`T[]`), `columns` (`TableColumn<T>[]`).
- **Server-side paging**: pass `[paginationService]` (a `PaginationServiceInterface<T>` from `./table.model`). Providing it hands paging control to the parent and makes the built-in paginator display-only. Omit it for client-side paging via `MatTableDataSource`.
- ❌ `[pagination]` does not exist — the input is `paginationService`.

### 7. Feedback & Overlay Components

- `<app-loader>`: Standardized circular loading spinner wrapper with overlay support.
- `<app-logo>`: Consistent SVG application branding logo.
- `<app-base-dialog>`: Shell for dialog layout (title / content / actions). Build new dialogs on top of this.
- `<app-confirm-dialog>`: Ready-made confirm / cancel dialog.
- `<app-img-preview-dialog>`: Lightbox image preview dialog.

### 8. Directives & Pipes — `src/app/shared/directives/`, `src/app/shared/pipes/`

- `HorizontalScrollDirective` (`src/app/shared/directives/horizontal-scroll`): drag / wheel horizontal scrolling.
- `TemplateTypeDirective` (`src/app/shared/directives/template-type`): type-safe `ng-template` context — read its `USAGE.md` before use.
- `PenceToPoundsPipe`, `TimestampDatePipe` (`src/app/shared/pipes/`): use these instead of inline formatting logic.

---

## 🎯 5. Zero-Randomness AI Quality Checklist

When generating or editing any template, style, or component, verify:

1. [ ] **No Custom Colors**: Is every color from `--mat-sys-*` or Tailwind semantic tokens (`bg-primary`, `text-on-surface`, `bg-surface-container`)? No raw hex or plain color names.
2. [ ] **No `::ng-deep`**: Are Material modifications placed in `src/styles/ng-material/components/_{name}.scss` using `@include mat.<name>-overrides`?
3. [ ] **No Class Bloat Duplication**: Are repeated utility chains (2+ times) extracted to `src/styles/tailwind/components/`?
4. [ ] **Icons**: Are all icons using `<mat-icon name="..." />` with `iconColor`, `size`, `type` inputs (zero content projection), AND is `SharedIconModule` in the component's `imports`?
5. [ ] **Buttons**: Are button variants using `matButton="filled|outlined|elevated|text"` and `theme="..."` (zero `color="primary"`)?
6. [ ] **Typography**: Are headings and body text using semantic utilities (`font-headline-*`, `font-title-*`, `font-body-*`, `font-label-*`)?
7. [ ] **Sizing**: Is `size-{N}` used instead of `w-{N} h-{N}` for square/equal dimensions?
8. [ ] **Important Syntax**: Is `!` placed as suffix (e.g. `hidden!`, `p-4!`)?
9. [ ] **Reusable UI**: Were `src/app/shared/ui/`, `shared/directives/`, and `shared/pipes/` checked before creating any new input, card, badge, chip, table, directive, or pipe?
10. [ ] **Real Inputs**: Was every shared-component binding confirmed against the component source (e.g. chips is `[(value)]`, tables use `[paginationService]`, form controls use `[formField]`)? Never guess an input name.
11. [ ] **Aliases**: Are imports using `@shared/*`, `@core/*`, `@features/*`, `@env/*` instead of deep relative paths?
