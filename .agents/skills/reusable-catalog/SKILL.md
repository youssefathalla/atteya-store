---
name: reusable-catalog
description: Living catalog and index of all reusable Shared UI components, extracted Tailwind CSS classes, core services, directives, and pipes in Atteya Store. Check this skill FIRST before writing any new component, directive, service, or CSS class to eliminate duplication and enforce the 2+ Duplication Rule.
---

# 📚 Reusable Components, Classes & Logic Catalog

This skill is the **Single Source of Truth** for reusable assets across Atteya Store.
**Golden Rule**: Never hand-roll a UI control, utility chain, or service without checking this catalog first.

---

## 🗂️ Table of Contents

1. [Shared UI Components (`src/app/shared/ui/`)](#1-shared-ui-components)
2. [Extracted Tailwind Classes (`src/styles/tailwind/components/`)](#2-extracted-tailwind-classes)
3. [Core Shared Services (`src/app/core/services/`)](#3-core-shared-services)
4. [Shared Directives & Pipes (`src/app/shared/`)](#4-shared-directives--pipes)
5. [Shared Schemas & Firebase Utilities (`src/app/shared/`)](#5-shared-schemas--firebase-utilities)
6. [The "2+ Duplication Rule" Extraction Protocol](#6-the-2-duplication-rule-protocol)

---

## 1. Shared UI Components

Located in `src/app/shared/ui/`. Import them via `@shared/ui/...`.

### 📋 Form Controls (`src/app/shared/ui/forms/`)

All controls integrate seamlessly with **Angular 22 Signal Forms**.

- **Usage**: Bind `[formField]="form.field"` and `label="Label"`. Errors render automatically.
- **Controls**:
  - `<app-text-input>`: Single-line input with prefix/suffix icon support.
  - `<app-text-field-input>`: Multi-line textarea control.
  - `<app-password-input>`: Password input with built-in visibility toggle.
  - `<app-select-input [options]="options">`: Accessible select dropdown.
  - `<app-date-input>`: Material Datepicker input.
  - `<app-location-input>`: Location search and autocomplete input.
  - `<app-file-input>`: Drag-and-drop file uploader with size validation.
  - `<app-timepicker>`: Time selection control.

### 📊 Data Tables (`src/app/shared/ui/reusable-table/`)

- **Selector**: `<app-reusable-table [data]="data" [columns]="columns" />`
- **Inputs**:
  - `[data]`: Array of row items `T[]`.
  - `[columns]`: `TableColumn<T>[]` configuration array.
  - `[paginationService]`: Provide for server-side pagination (implements `PaginationServiceInterface<T>`).
  - ❌ Never pass `[pagination]` (the input is `paginationService`).

### 🏷️ Status Badges & Chips

- **Status Badge** (`src/app/shared/ui/status-badge/`):
  - `<app-status-badge [value]="status" [statusConfig]="config" />`
  - Values are lowercased internally. Config keys must be lowercase (`active`, `pending`, `danger`).
- **Filter Chips** (`src/app/shared/ui/chips/`):
  - `<app-chips [chips]="categories" [(value)]="selectedCategory" ariaLabel="Filter categories" />`
  - `[(value)]` is a two-way signal model. ❌ `[selected]` does not exist.

### 🃏 Cards & Layout Containers (`src/app/shared/ui/cards/`)

- `<app-base-card>`: Elevated surface container with hover glow and slots: `card-header`, `card-content`, `card-sub-content`, `card-actions`.
- `<app-info-card [title]="..." [value]="..." [icon]="...">`: Metric & KPI statistics card.
- `<app-review-card [review]="review">`: Testimonial and customer rating card.

### 💬 Dialogs & Modals (`src/app/shared/ui/dialogs/`)

- `<app-base-dialog>`: Foundation shell for dialog titles, content, and action buttons.
- `<app-confirm-dialog>`: Ready-to-use confirmation dialog (Delete, Cancel, Proceed).
- `<app-img-preview-dialog>`: Lightbox image preview modal.

### 💎 Brand & Visual Identity

- `<mat-icon name="home" />`: Always import `SharedIconModule` from `@shared/ui/mat-icon`.
- `<app-logo [size]="'sm' | 'md' | 'lg'" />`: App branding logo SVG.
- `<app-loader>`: Standardized loading spinner overlay.

---

## 2. Extracted Tailwind Classes

Located in `src/styles/tailwind/components/`. Use these classes directly in your templates.

| File | Reusable Classes | Description |
| :--- | :--- | :--- |
| `navigation.css` | `.nav-column-title` | Uppercase category/column headers with bottom border |
| | `.nav-menu-link` | Interactive nav item link with hover state and transitions |
| | `.nav-badge` | Small badge indicator for menu links |
| | `.nav-category-tab` | Top-level category tab button in navigation bar |
| | `.drag-handle-wrapper` | Drag handles for re-ordering items in admin dashboards |
| | `.nav-admin-card` | Styled card for admin navigation items |
| `status.css` | `.status-badge` | Badge background, padding, and text formatting |
| | `.chip` | Rounded interactive filter chip |
| | `.chip-icon-wrapper` | Icon container inside filter chips |
| | `.vehicle-status` | Card container with outline-variant border and padding |
| `spacing.css` | `.container-content` | Responsive page container max-width and padding (`px-4 sm:px-6 lg:px-8`) |
| | `.hero-space` | Standard hero section spacing |
| | `.section-space` | Vertical spacing between page sections |
| `images.css` | `.image-mask` | Image clipping and gradient mask |
| | `.hero-image` | Full-width responsive hero image container |
| `overlays.css` | `.loading-overlay` | Full-screen semi-transparent loading backdrop |
| | `.badge-overlay` | Absolute-positioned badge over an image or card |
| | `.icon-overlay` | Absolute-positioned icon container over an image or card |
| `components-base.css` | `.base-card` | Base border, rounded corner, and surface container styling |
| | `.form-card` | Styled container for forms and inputs |
| | `.bg-circle` | Circular icon / avatar wrapper container |

---

## 3. Core Shared Services

Located in `src/app/core/services/` or layout services. Inject them using `inject(ServiceName)`:

- **`DrawerService`** (`src/app/core/services/drawer/drawer.service.ts`):
  - `activeDrawer()`: Signal representing current open drawer (`'cart'`, `'menu'`, or `null`).
  - `open(name)`: Opens specified drawer.
  - `close()`: Closes any active drawer.
  - `toggle(name)`: Toggles drawer state.
- **`SnackbarService`** (`src/app/core/services/snack-bar/snack-bar.service.ts`):
  - `show(msg, theme)`: Triggers M3 status snackbar.
  - Helper methods: `success(msg)`, `error(msg)`, `warning(msg)`, `info(msg)`.
- **`ThemeService`** (`src/app/core/services/theme/theme.service.ts`):
  - `isDark()`: Signal returning boolean dark mode state.
  - `toggleTheme()`: Toggles dark / light theme.
- **`LoadingService`** (`src/app/core/services/loading/loading.service.ts`):
  - `isLoading`: Computed signal indicating whether any task is running.
  - `setLoading(key)`: Registers a key as active loading.
  - `stopLoading(key)`: Unregisters a loading key.
- **`SeoService`** (`src/app/core/services/seo/seo.service.ts`):
  - `setPageMetadata(config)`: Sets title, meta description, and robots tags.
  - `setTitle(title)` / `updateTag(tag)`.
- **`AuthService`** (`src/app/core/services/auth/auth.service.ts`):
  - `user`: Signal holding `User | null | undefined`.
  - `isAuthenticated`: Computed boolean.
  - `login(email, pass)`, `register(email, pass)`, `logout()`, `sendPasswordReset(email)`.
- **`NavService`** (`src/app/layout/navbar/nav.service.ts`):
  - `categories`: Computed signal for live navigation catalog with fallback.
  - `isLive` / `isLoading`: Computed state signals.
  - `updateNavigation(categories)`, `seedDefaultNavigation()`.

---

## 4. Shared Directives & Pipes

- **`HorizontalScrollDirective`** (`src/app/shared/directives/horizontal-scroll`):
  - Enables smooth drag-to-scroll and mouse-wheel horizontal scrolling.
  - `<div appHorizontalScroll [snapToItems]="false" [wheelSpeed]="2.0" [dragSpeed]="1.5">`
- **`TemplateTypeDirective`** (`src/app/shared/directives/template-type`):
  - Provides type-safety for `ng-template` context variables.
- **`PenceToPoundsPipe`** (`src/app/shared/pipes/`):
  - Converts integer pence into formatted GBP currency strings.
- **`TimestampDatePipe`** (`src/app/shared/pipes/`):
  - Formats Firestore `Timestamp` objects into localized date strings.

---

## 5. Shared Schemas & Firebase Utilities

Located in `src/app/shared/schemas/` and `src/app/shared/utils/firebase/`:

- **Common Schemas** (`src/app/shared/schemas/common.schema.ts`):
  - `idSchema` / `IdSchema`: Non-empty trimmed string ID validator.
  - `slugSchema` / `SlugSchema`: URL-safe slug validator.
  - `timestampSchema` / `TimestampSchema`: Firestore `Timestamp` / Date / ISO string parser.
  - `auditSchema` / `AuditSchema`: Created/updated timestamp tracking.
  - `emailSchema`: Validated email address parser with trim.
  - `phoneSchema`: International phone number format validator.
  - `passwordSchema`: Secure password validator with minimum length enforcement.
  - `futureDateSchema`: Date validator ensuring selection is today or in the future.
  - `timestampToDate`: Transform pipeline converting Firestore `Timestamp` to JavaScript `Date`.
- **Firestore Converters** (`src/app/shared/utils/firebase/firestore-converter.ts`):
  - `createValibotConverter(schema)`: Creates a strongly typed `FirestoreDataConverter<T>` powered by Valibot `v.parse()`, injecting document `id`.
- **Firestore Signals** (`src/app/shared/utils/firebase/firestore-signals.ts`):
  - `signalDoc(docRef)`: Binds a Firestore document snapshot directly to an Angular Signal (SSR-safe, auto-unsubscribing).
  - `signalCollection(queryRef)`: Binds a Firestore query/collection to an Angular Signal (SSR-safe, auto-unsubscribing).
- **Error Handling & Retry** (`src/app/shared/utils/firebase/`):
  - `firebaseErrors(error)` / `mapFirebaseError` / `handleFirebaseError`: Translates Firebase Auth, Firestore, Storage, and Functions errors into user-friendly status messages.
  - `authRetryConfig` / `firestoreRetryConfig`: RxJS retry configurations for transient network failures.
  - `withRetry(operation, options)`: Retries idempotent async Promise operations with exponential backoff.

---

## 6. The "2+ Duplication Rule" Protocol

Whenever you find a combination of 4 or more utility classes that is repeated **2 or more times**:

1. **Do NOT copy-paste the utility chain**.
2. **Select the destination file**:
   - Navigation: `src/styles/tailwind/components/navigation.css`
   - Spacing: `src/styles/tailwind/components/spacing.css`
   - Status & Badges: `src/styles/tailwind/components/status.css`
   - Cards & General: `src/styles/tailwind/components-base.css`
   - New domain: Create `src/styles/tailwind/components/[domain].css` and import it in `src/tailwind.css`.
3. **Extract using Tailwind v4 `@layer components`**:

   ```css
   @layer components {
     .custom-feature-card {
       @apply block w-full p-6 bg-surface-container-low border border-outline-variant rounded-corner-xs shadow-mat-1 hover:border-primary transition-all duration-300;
     }
   }
   ```

4. **Use the new class** in your templates.
5. **Update this catalog** with the new class name.
