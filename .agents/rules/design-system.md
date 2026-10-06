---
trigger: glob
globs: '**/*.{html,css,scss,ts}'
---

# 🎨 Design System Contract

The **vocabulary and hard bans** for any markup or style you write. Zero styling randomness.

This file is deliberately lookup-free: everything here you can use immediately. For directory structure, the Material override workflow, style-file registration, full shared-component APIs, and the audit checklist, activate the **`design-system`** skill.

> Applies to `.html`, `.css`, `.scss` **and `.ts`** — roughly a third of this project's components use inline templates, so the rules must travel with TypeScript files too.

---

## 1. The Hard Bans

| ❌ Never | ✅ Always |
| :--- | :--- |
| Tailwind classes on Angular Material components (`text-*`, `hover:*`, `bg-*` on `matIconButton`, `matButton`, `mat-icon`, `mat-menu`, etc.) | **NEVER** style Material components. They are already styled. Style **only native HTML elements** (`div`, `nav`, `section`, `a`, etc.) unless explicitly asked. |
| `::ng-deep`, component CSS on Material internals | `@include mat.<component>-overrides(( ... ))` in `src/styles/ng-material/components/` |
| Raw colors: `bg-red-500`, `text-white`, `#fff` | Semantic tokens: `bg-primary`, `text-on-surface` |
| Redundant color classes (e.g. `text-primary` inside `text-on-surface`, `<span class="text-primary">.</span>`) | Inherit parent color; design is strictly Monochrome (Black & White) |
| Prefix important: `!hidden` | Suffix important: `hidden!` |
| `w-10 h-10` | `size-10` |
| `bg-opacity-50` | `bg-black/50` |
| `text-2xl font-bold` for headings | `font-headline-md` |
| `color="primary"` on Material components | `theme="success \| warning \| error \| info"` |
| `<mat-icon>home</mat-icon>` | `<mat-icon name="home" />` |
| `tailwind.config.js` (does not exist — v4 is config-less) | `@theme` / `@utility` / `@layer components` in `src/styles/tailwind/` |

> [!CAUTION]
> **STRICT RULE — ZERO TAILWIND ON ANGULAR MATERIAL COMPONENTS**:
> Angular Material components (`button[matButton]`, `button[matIconButton]`, `<mat-icon>`, `<mat-menu>`, `<mat-drawer>`, `<mat-checkbox>`, etc.) are already fully themed and styled. **NEVER** apply Tailwind styling, color, transition, or hover classes to Material components. You may only style **native HTML elements** (`<div>`, `<nav>`, `<section>`, `<ul>`, `<a>`, etc.) for layout and spacing.

**Monochrome (Black & White) Identity**: `primary` is black, and base content text is already black (`text-on-surface`). Never wrap punctuation or words in redundant color spans (e.g. write `ATTEYA.` cleanly, not `ATTEYA<span class="text-primary">.</span>`). Inherit colors naturally from parent containers.

**Material first**: let Angular Material own structure, text sizes and elevation. Use Tailwind for layout, spacing and page composition.

**The "2+ Duplication Rule"**: if a chain of ~4+ utilities appears on **2 or more** elements, do not copy-paste it — extract a class into `src/styles/tailwind/components/`. The skill lists which file and how to register a new one.

---

## 2. Typography

| Scale | Classes |
| :--- | :--- |
| Display | `font-display-lg` \| `font-display-md` \| `font-display-sm` |
| Headline | `font-headline-lg` \| `font-headline-md` \| `font-headline-sm` |
| Title | `font-title-lg` \| `font-title-md` \| `font-title-sm` |
| Body | `font-body-lg` \| `font-body-md` \| `font-body-sm` |
| Label | `font-label-lg` \| `font-label-md` \| `font-label-sm` |

---

## 3. Color Tokens

Each of `primary`, `secondary`, `tertiary`, `error` exposes the full M3 set:

`text-{name}` · `bg-{name}` · `text-on-{name}` · `bg-{name}-container` · `text-on-{name}-container`

**Surface**: `bg-surface`, `text-on-surface`, `bg-surface-variant`, `text-on-surface-variant`, `bg-surface-container`, `bg-surface-container-low`, `bg-surface-container-lowest`, `bg-surface-container-high`, `bg-surface-container-highest`, `bg-surface-bright`, `bg-surface-dim`, `bg-inverse-surface`, `text-inverse-on-surface`

**Status colors** (base + `on-` only, no container variants): `text-success` / `bg-success` / `text-on-success`, and the same for `warning` and `info`.

**Outline**: `border-outline`, `border-outline-variant`

**Elevation**: `shadow-mat-1` … `shadow-mat-5`  ·  **Radius**: `rounded-corner-xs` … `rounded-corner-xl`

**Status themes** — set as an attribute to cascade a palette onto a component or container:
`theme="success"` (spring green) · `theme="warning"` (yellow) · `theme="info"` (azure) · `theme="error"` (red)

---

## 4. Custom Utilities

- **Layout**: `elements-center`, `elements-start`, `elements-end`, `elements-between`, `form-space`
- **Viewport height**: `dvh-10` … `dvh-full`, and `dvh-page-10` … `dvh-page-full` (subtracts header/footer)
- **Icon fill**: `ms-fill`

---

## 5. Buttons

- **Variants**: `<button matButton="filled | tonal | outlined | elevated | text">Action</button>`
- **Plain text button**: `<button matButton>Action</button>`
- **Icon button**: `<button matIconButton aria-label="Home"><mat-icon name="home" /></button>`

> [!IMPORTANT]
> Never `color="primary" | "warn"`. Use `theme="..."` for status coloring. Icon-only buttons require `aria-label`.

---

## 6. Icons

- **Import (REQUIRED)**: `imports: [SharedIconModule]` from `@shared/ui/mat-icon`. Without it the icon renders nothing.
- **`name`** is required: `<mat-icon name="home" />` — content projection is forbidden.
- **`iconColor`** (not `color`): `primary | secondary | tertiary | success | warning | error | info`
- **`size`**: `xs | sm | base | lg | xl | 2xl … 7xl`, default `2xl`. Omit unless overriding. Never resize with `scale-125` or `text-[20px]`.
- **`type="fill"`** for the filled variant. **`weight`**: `100`–`700`, default `500`.

```html
<mat-icon name="check_circle" iconColor="success" type="fill" size="3xl" />
```

---

## 7. Reuse Before Building

Check `src/app/shared/ui/`, `shared/directives/`, and `shared/pipes/` first. Verify inputs against the component source — the skill documents each API in full.

- **Forms**: `<app-text-input>`, `<app-text-field-input>`, `<app-password-input>`, `<app-select-input>`, `<app-date-input>`, `<app-location-input>`, `<app-file-input>`, `<app-timepicker>`
  - Signal Forms based: bind `[formField]="form.field"` + `label`. Never `[formControl]` or `[(ngModel)]`. Errors render themselves.
- **Cards**: `<app-base-card>`, `<app-info-card>`, `<app-review-card>`
- **Status badge**: `<app-status-badge [value]="status" [statusConfig]="config" />` — config keys must be lowercase.
- **Chips**: `<app-chips [chips]="items" [(value)]="selected" />` — `value` is a model input. `[selected]` does NOT exist.
- **Table**: `<app-reusable-table [data]="data" [columns]="columns" />` — add `[paginationService]` for server-side paging. There is no `[pagination]` input.
- **Overlays**: `<app-loader>`, `<app-base-dialog>`, `<app-confirm-dialog>`, `<app-img-preview-dialog>`, `<app-logo>`
- **Directives & pipes**: `HorizontalScrollDirective`, `TemplateTypeDirective` (read its `USAGE.md`), `PenceToPoundsPipe`, `TimestampDatePipe`

---

## 8. Going Deeper

Activate the **`design-system`** skill for the style directory map, the Material M3 override workflow and its one documented exception, how to register new style files, per-component input reference, and the pre-commit quality checklist.
