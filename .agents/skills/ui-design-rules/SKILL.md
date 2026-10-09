---
name: ui-design-rules
description: Actionable Component Decision Matrix and styling guardrails for Atteya Store. Explicitly governs when to use Shared UI components vs Angular Material M3 vs Native HTML + Tailwind, which design tokens and surface layers to apply, and the strict hard bans (Zero Tailwind on Material, Monochrome identity).
---

# 🎨 UI Design Rules & Component Decision Matrix

This skill is the **decision authority** for selecting and styling components in Atteya Store.
It answers:

1. **What component to use for what?**
2. **What tokens and colors to use?**
3. **What is strictly forbidden to override?**

> 🔗 **Pointers**: Token vocabulary and hard bans are enforced in [.agents/rules/design-system.md](file:///.agents/rules/design-system.md). Full M3 override mixins and SCSS partial workflows live in [design-system](file:///.agents/skills/design-system/SKILL.md).

---

## 🧭 1. Component Selection Matrix: When to Use What

| Requirement | What to Use | Example / Selector | Why / Rules |
| :--- | :--- | :--- | :--- |
| **Text & Form Inputs** | **Shared UI Forms** | `<app-text-input [formField]="f.name" label="Name" />` | Powered by Signal Forms. Errors render automatically. **Never** write manual `mat-form-field` or `mat-error`. |
| **Select Dropdowns** | **Shared UI Forms** | `<app-select-input [formField]="f.category" [options]="opts" label="Category" />` | Accessible, handles dark mode and validation. |
| **File / Media Uploads** | **Shared UI Forms** | `<app-file-input [formField]="f.avatar" label="Upload Logo" />` | Drag & drop, preview, size checks included. |
| **Action & Icon Buttons** | **Angular Material M3** | `<button matButton="filled">Save</button>` or `<button matIconButton aria-label="Cart"><mat-icon name="shopping_bag" /></button>` | Fully themed by M3. **ZERO Tailwind classes** on the button element. Icon buttons require `aria-label`. |
| **Status / State Badges** | **Shared UI Badge** | `<app-status-badge [value]="status" [statusConfig]="config" />` | Standardized colors and icons across storefront and admin. |
| **Filter Chips** | **Shared UI Chips** | `<app-chips [chips]="list" [(value)]="selected" />` | Two-way model binding `[(value)]`. Single-select radiogroup semantics. |
| **Data Tables** | **Shared UI Table** | `<app-reusable-table [data]="items" [columns]="cols" />` | Built-in sorting, filtering, and optional `[paginationService]`. |
| **Confirm / Delete Dialog** | **Shared UI Dialog** | `<app-confirm-dialog>` or `MatDialog.open(ConfirmDialogComponent)` | Standard confirmation modal with title, message, and action buttons. |
| **Menus & Dropdowns** | **Angular Material M3** | `<button matIconButton [matMenuTriggerFor]="menu">` with `<mat-menu #menu="matMenu">` | Handles keyboard navigation, focus trap, and ARIA attributes out of the box. |
| **Side Drawers & Panels** | **Angular Material M3** | `<mat-drawer>` inside `<mat-drawer-container>` | Slide-over panels (Cart, Mobile Menu). Style through host attributes or `DrawerService`. |
| **Page Layout & Sections** | **Native HTML + Tailwind** | `<section class="container-content py-8">`, `<header>`, `<main>`, `<article>` | Native semantic HTML handles document landmarks; Tailwind handles flex/grid and spacing. |
| **Cards & Containers** | **Shared UI Card or Native HTML** | `<app-base-card>` (with header/content/actions slots) OR `<div class="base-card">` | Consistent border, radius, and background surfaces. |

---

## 🖤 2. Monochrome Brand Identity & Token Architecture

The brand identity is strictly **Monochrome (Black & White)**.

- `primary` is black (`var(--mat-sys-primary)`).
- Default base text is naturally black (`var(--mat-sys-on-surface)` inherited from `body`).
- **NEVER write `text-on-surface` on any element**: It is already default on `body`. Writing it is strictly forbidden as redundant class bloat.
- **Never wrap punctuation or text in redundant color spans**:
  - ❌ `ATTEYA<span class="text-primary">.</span>`
  - ✅ `ATTEYA.`

### Typography Scale & Weight Rules

Always use official Material M3 typography tokens:

| Scale | Token Classes | Where to Use |
| :--- | :--- | :--- |
| **Display** | `font-display-lg` \| `font-display-md` \| `font-display-sm` | Hero headers, high-impact titles |
| **Headline** | `font-headline-lg` \| `font-headline-md` \| `font-headline-sm` | Page headers, main section headers |
| **Title** | `font-title-lg` \| `font-title-md` \| `font-title-sm` | Card headers, table headers, group headers |
| **Body** | `font-body-lg` \| `font-body-md` \| `font-body-sm` | Descriptions, paragraphs, content text |
| **Label** | `font-label-lg` \| `font-label-md` \| `font-label-sm` | Breadcrumbs, badges, chips, buttons, meta info |

> [!IMPORTANT]
> **Bold Weight Overrides (`font-bold!`)**:
> M3 typography tokens define a `font:` CSS shorthand including default font-weight. To make text bold, **always append `font-bold!`** (e.g. `font-label-lg font-bold!`, `font-display-md font-bold!`). Never use `font-bold` without `!`, and never use `font-medium`, `font-semibold`, or `font-black`.
> Never mix arbitrary Tailwind font sizes (`text-xs`, `text-sm`, `text-2xl`, etc.) with or instead of typography tokens.

### Surface Layers (Elevation without heavy shadows)

Use M3 surface container tokens to create depth:

1. `bg-surface-container-lowest`: Lowest layer (e.g. page background in dark mode, minimal footer).
2. `bg-surface-container-low`: Secondary background (e.g. cards, subtle sections).
3. `bg-surface`: Default base surface (e.g. navbar, drawers, modals).
4. `bg-surface-container-high` / `bg-surface-container-highest`: Hover states, dropdowns, elevated panels.

> ⚠️ **CAUTION**: Never use `bg-on-primary` as a container background (it inverts color semantics).

### Status Token Palette

Only use semantic status tokens. Never use arbitrary Tailwind palette colors:

- **Success**: `bg-success`, `text-success`, `text-on-success` (❌ never `bg-emerald-500` or `text-green-600`)
- **Warning**: `bg-warning`, `text-warning`, `text-on-warning` (❌ never `bg-amber-400` or `text-yellow-500`)
- **Error**: `bg-error`, `text-error`, `text-on-error` (❌ never `bg-red-500`)
- **Info**: `bg-info`, `text-info`, `text-on-info` (❌ never `bg-blue-500`)

---

## 🚫 3. Hard Bans & "Never Override" Rules

1. **ZERO Tailwind on Angular Material Components**:
   - Material components (`button[matButton]`, `button[matIconButton]`, `<mat-icon>`, `<mat-menu>`, `<mat-drawer>`, `<mat-checkbox>`, `<mat-table>`) are pre-styled.
   - ❌ Never add color/theme classes (`class="bg-error! text-on-error!"`, `class="text-red-500"`) to `button[matButton]`. Use semantic attributes: `theme="error"`, `theme="info"`, `theme="warning"`, `theme="success"`.
   - ❌ Never add layout styling (`flex`, `items-center`, `gap-*`, `w-full`) directly to `button[matButton]`. Material 3 buttons align `<mat-icon>` and text natively. For custom child layout, wrap contents inside a native `<span class="flex items-center gap-2">`. For full-width buttons, wrap in a container element (`<div class="w-full [&>button]:w-full">`).
   - ❌ Never add `class="text-red-500"` or sizing classes to `<mat-icon>`. Use `iconColor="..."` and `size="..."` inputs.
   - ❌ Never add Tailwind styling to `<mat-drawer>` or `<mat-menu>`. Use M3 override partials (`src/styles/ng-material/components/`).
2. **NEVER Write `text-on-surface`**:
   - ❌ `<div class="text-on-surface">`, `<h1 class="font-display-md text-on-surface">`
   - ✅ Omit it entirely; text color is inherited automatically from `body`.
3. **No Arbitrary Font Sizes & Always Suffix `font-bold!`**:
   - ❌ `class="text-xs text-on-surface-variant font-medium"`, `class="text-3xl font-black"`, `class="font-bold"` (without `!`)
   - ✅ `class="font-label-sm"`, `class="font-display-md font-bold!"`
4. **No `::ng-deep`**:
   - Material style overrides must live in `src/styles/ng-material/components/_{name}.scss` using official `@include mat.<name>-overrides(( ... ))`.
5. **Tailwind v4 Suffix `!` Only**:
   - ❌ `!hidden`, `!p-4`, `!flex`
   - ✅ `hidden!`, `p-4!`, `flex!`
6. **Dimensions**:
   - For equal width and height, always use `size-{N}`:
   - ❌ `w-10 h-10`, `w-6 h-6`
   - ✅ `size-10`, `size-6`
7. **Icon Projection**:
   - ❌ `<mat-icon>shopping_bag</mat-icon>`
   - ✅ `<mat-icon name="shopping_bag" />` (with `SharedIconModule` imported).
