---
trigger: glob
globs: '**/*.{html,css,scss,ts}'
---

# Design System Contract

The **vocabulary and hard bans** for any markup or style in Atteya Store. Zero styling randomness.
Lookup-free quick reference. For style directory map, SCSS mixins, and component APIs, activate the **`design-system`** or **`reusable-catalog`** skills.

---

## 1. The Hard Bans

| ❌ Never                                                                                                                            | ✅ Always                                                                                                                               |
| :---------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind on Angular Material components (`text-*`, `hover:*`, `bg-*` on `matIconButton`, `matButton`, `mat-icon`, `mat-menu`, etc.) | **NEVER** style Material components. They are already themed. Style **only native HTML elements** (`div`, `nav`, `section`, `a`, etc.). |
| `::ng-deep` or component CSS on Material internals                                                                                  | Use `@include mat.<component>-overrides(( ... ))` in `src/styles/ng-material/components/`                                               |
| `text-on-surface` on any element                                                                                                    | **BANNED**: `body` already sets `color: var(--mat-sys-on-surface)`. Text color is inherited. Never write `text-on-surface`.             |
| Raw colors: `bg-red-500`, `text-white`, `#fff`                                                                                      | Use semantic tokens: `bg-primary`, `bg-surface-container-*`, `text-on-primary`                                                          |
| Redundant color spans (`<span class="text-primary">.</span>`)                                                                       | Inherit parent color; design is strictly Monochrome (Black & White). Write `ATTEYA.` cleanly.                                           |
| Arbitrary text sizes & weights (`text-xs`, `text-sm`, `font-medium`, `font-semibold`, `font-bold`)                                  | Use M3 `font-*-*` tokens. To bold text, **always use `font-bold!`** (trailing `!` overrides M3 `font:` shorthand).                      |
| Prefix important: `!hidden`                                                                                                         | Suffix important: `hidden!`                                                                                                             |
| `w-10 h-10`                                                                                                                         | `size-10`                                                                                                                               |
| Verbose flex chains (`flex items-center justify-center`, `flex flex-col ...`)                                                       | Use layout shortcuts: `elements-center`, `elements-start`, `elements-end`, `elements-between` (row) and `elements-*-col` (col)          |
| `bg-opacity-50`                                                                                                                     | `bg-black/50`                                                                                                                           |
| `color="primary"` on Material components                                                                                            | Use `theme="success \| warning \| error \| info"` for status coloring                                                                   |
| `<mat-icon>home</mat-icon>`                                                                                                         | `<mat-icon name="home" />` with `SharedIconModule`                                                                                      |
| Arbitrary corner radii (`rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`)                                                        | Single source of truth: `border-shape` (`border-radius: var(--border-shape, 2px)`)                                                      |
| Raw unoptimized `<img>` for media assets                                                                                            | `NgOptimizedImage` (`[ngSrc]`, `fill`, `priority`, `sizes`) with ImageKit CDN and `normalizeImageKitPath()`                             |
| `@container` on the same element as `cqw` / `.container-content`                                                                    | Keep `@container` on `<main>` (or preview wrapper); use `.container-content` (`p-[5cqw]`) on child sections                             |
| Combining `.container-content` and `.section-space` on the same element                                                             | Use `.container-content` alone (already includes `p-[5cqw]`)                                                                            |
| Missing `host: { class: 'block w-full' }` on section/page components                                                                | Always declare `host: { class: 'block w-full' }` on `app-*-section` and page components to prevent inline width/height collapse         |
| Adding `aspect-*` to full-height hero containers (`h-[calc(100dvh-var(--storefront-top-chrome,56px))]`)                            | Omit `aspect-*` on full-viewport hero slides so `aspect-ratio` does not override `h-full`                                               |
| Technical jargon in UI copy                                                                                                         | Human-first, outcome-focused plain language (simple everyday words, clear intent)                                                       |

> **The "2+ Duplication Rule"**: If a chain of ~4+ utilities appears on **2 or more** elements, extract a class into `src/styles/tailwind/components/`.

---

## 2. Typography

Always use Material M3 typography tokens. Never use arbitrary Tailwind text sizing (`text-xs`, `text-sm`, `text-2xl`).

| Scale        | Token Classes                                                  | Standard Role                                 |
| :----------- | :------------------------------------------------------------- | :-------------------------------------------- |
| **Display**  | `font-display-lg` \| `font-display-md` \| `font-display-sm`    | Hero sections, high-impact branding           |
| **Headline** | `font-headline-lg` \| `font-headline-md` \| `font-headline-sm` | Page headers, major section headers           |
| **Title**    | `font-title-lg` \| `font-title-md` \| `font-title-sm`          | Card headers, table headers, group titles     |
| **Body**     | `font-body-lg` \| `font-body-md` \| `font-body-sm`             | Descriptions, paragraphs, content text        |
| **Label**    | `font-label-lg` \| `font-label-md` \| `font-label-sm`          | Breadcrumbs, badges, chips, captions, buttons |

> [!IMPORTANT]
> **Bold Weight**: M3 tokens set `font:` shorthand. You MUST write **`font-bold!`** (with trailing `!`) when bolding (e.g. `<h1 class="font-display-md font-bold! uppercase">`). Never use `font-semibold` or `font-medium`.

---

## 3. Color Tokens

- **Palettes**: `primary` (Black), `secondary`, `tertiary`, `error` expose:
  `text-{name}` · `bg-{name}` · `text-on-{name}` · `bg-{name}-container` · `text-on-{name}-container`
- **Surface**: `bg-surface`, `bg-surface-variant`, `text-on-surface-variant`, `bg-surface-container`, `bg-surface-container-low`, `bg-surface-container-lowest`, `bg-surface-container-high`, `bg-surface-container-highest`, `bg-surface-bright`, `bg-surface-dim`, `bg-inverse-surface`, `text-inverse-on-surface`
- **Status colors**: `text-success` / `bg-success` / `text-on-success` (same for `warning`, `info`, `error`)
- **Outline & Elevation**: `border-outline`, `border-outline-variant`, `shadow-mat-1` … `shadow-mat-5`
- **United Shape**: `border-shape` (governed by `--border-shape: 2px` in `:root`)
- **Status Themes**: Cascaded via `theme="success | warning | info | error"`

---

## 4. Layout & Viewport Sizing Standards

1. **Top-Level Query Container**:
   - `<main>` inside `main.component.html` carries `@container`. Page-level sections and cards must use `cqw` to remain fluid relative to drawer open/close and responsive main layouts.
   - Never place `@container` on the same element where `cqw` padding is declared (CSS cannot query itself).
2. **Angular Component Host Sizing**:
   - All section and page components (`app-*-section`, `app-*`) must define `host: { class: 'block w-full' }` in `@Component()` to prevent `display: inline` height/width collapse.
3. **Full-Viewport Sections**:
   - Full-screen heroes directly below the stacked top chrome must use `h-[calc(100dvh-var(--storefront-top-chrome,56px))]`. `--storefront-top-chrome` is measured from the shipping banner + desktop nav stack in `MainLayoutComponent` (falls back to `56px` / `h-14` navbar-only).
   - When a full-height hero is specified, do NOT add `aspect-*` (`aspect-video`, `aspect-21/9`) to the slide containers, as `aspect-ratio` overrides height in modern CSS.
4. **Section Spacing**:
   - Use `.container-content` as the single unified class for page section layout and responsive container padding (`p-[5cqw]`). Do not append `.section-space` to elements that already have `.container-content`.

---

## 5. Custom Utilities

- **Borders & Shapes**: `border-shape`
- **Layout (Row)**: `elements-center`, `elements-start`, `elements-end`, `elements-between`
- **Layout (Col)**: `elements-center-col`, `elements-start-col`, `elements-end-col`, `elements-between-col`, `form-space`
- **Viewport height**: `dvh-10` … `dvh-full`, and `dvh-page-10` … `dvh-page-full`
- **Safe Area Insets**: `pb-safe-bottom` (bottom nav), `pb-safe-drawer` (drawer over nav), `pt-safe-top` (notch)
- **Drag & Drop**: `.drag-handle-wrapper` (cursor & hover for `cdkDragHandle`)
- **Icon fill**: `ms-fill`

---

## 5. Buttons

- **Variants**: `<button matButton="filled | tonal | outlined | elevated | text">Action</button>`
- **Plain text button**: `<button matButton>Action</button>`
- **Icon button**: `<button matIconButton aria-label="Action"><mat-icon name="home" /></button>`
- **Loading State (Spinner-Only)**: Show **only the spinner** during loading (`<mat-progress-spinner mode="indeterminate" diameter="18" />`), never text + spinner together. Swap label/icon with `@if (isLoading()) { <mat-progress-spinner ... /> } @else { <mat-icon ... /> <span>Label</span> }` and add `[attr.aria-label]="isLoading() ? 'Loading...' : null"`.
- **Rule**: Never `color="primary"`. Use `theme="..."` for status colors. Icon-only buttons strictly require `aria-label`.

---

## 6. Icons

- **Import (REQUIRED)**: `imports: [SharedIconModule]` from `@shared/ui/mat-icon`.
- **Usage**: `<mat-icon name="home" />` — content projection (`<mat-icon>home</mat-icon>`) is forbidden.
- **Inputs**: `name` (required), `iconColor` (`primary | secondary | tertiary | success | warning | error | info`), `size` (`xs` … `7xl`), `type="fill"`, `weight` (`100`–`700`, default `500`).
- **Button Icons (Auto-Sized)**: Never write `size` on `<mat-icon>` inside buttons — `MatIconDirective` automatically detects button ancestors and applies `DEFAULT_BUTTON_ICON_SIZE` (`lg`). Standalone icons default to `2xl`.

---

## 7. Shared UI Components (Reuse Before Building)

Check `src/app/shared/ui/` first before creating any component:

- **Forms**: `<app-text-input>`, `<app-text-field-input>`, `<app-password-input>`, `<app-select-input>`, `<app-date-input>`, `<app-location-input>`, `<app-file-input>`, `<app-timepicker>` (Signal Forms: bind `[formField]="form.field"`).
- **Cards**: `<app-base-card>`, `<app-info-card>`, `<app-review-card>`
- **Badges & Chips**: `<app-status-badge [value]="status" [statusConfig]="config" />`, `<app-chips [chips]="items" [(value)]="selected" />`
- **Tables & Overlays**: `<app-reusable-table [data]="data" [columns]="columns" />`, `<app-loader>`, `<app-base-dialog>`, `<app-confirm-dialog>`, `<app-img-preview-dialog>`, `<app-logo>`

---

## 8. Human-First Microcopy

All UI copy (buttons, dialogs, snackbars, hints, empty states) must follow human-first communication:

1. **Outcome over Mechanism**: Describe what happens from the user's perspective, not backend operations.
2. **Everyday Words**: Use simple, familiar terminology. No technical or system jargon.
3. **Reassuring Feedback**: Provide calm, constructive guidance with clear next steps.
