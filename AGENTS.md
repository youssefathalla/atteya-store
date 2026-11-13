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
- **Page Not Found, Something Went Wrong, missing page code after a release, and category or brand addresses that redirect or answer 404**: read the `storefront-chrome` skill.

### 🎨 Design System & Styling

- **The Contract**: Token vocabulary and hard bans live in `.cursor/rules/design-system.mdc` (Cursor auto-loads for `.html`, `.css`, `.scss`, and `.ts`), `.agents/rules/design-system.md` (Antigravity glob rule), and `.claude/rules/design-system.md` (Claude Code, scoped to the same files). Edit the **body** in `.cursor/rules/design-system.mdc`, then run `npm run sync:agents` so Antigravity and Claude Code stay aligned. Adhere to all semantic tokens, M3 overrides, `<mat-icon name="icon" />` with `SharedIconModule`, and utility extraction rules.
- **Zero Tailwind on Angular Material**: Angular Material components (`button[matButton]`, `button[matIconButton]`, `<mat-icon>`, `<mat-menu>`, `<mat-drawer>`, etc.) are already fully styled by the M3 theme. **NEVER** apply Tailwind styling, color, transition, or hover classes to Material components. Only style **native HTML elements** (`<div>`, `<nav>`, `<section>`, `<ul>`, `<a>`, etc.) unless explicitly instructed by the user.
- **Monochrome (Black & White) Identity**: Brand aesthetic is strictly Black & White. `primary` is black; default text is naturally `text-on-surface` (inherited from `body`). **NEVER write `text-on-surface` on any element** — it is already the default inherited color and writing it is banned as redundant class bloat. Never add redundant child color overrides (e.g. `<span class="text-primary">.</span>`), and inherit colors cleanly.
- **Layout Alignment Shortcuts**: Always use custom layout shortcuts instead of writing verbose flex classes: Row: `elements-center`, `elements-start`, `elements-end`, `elements-between`. Column: `elements-center-col`, `elements-start-col`, `elements-end-col`, `elements-between-col`.
- **United Border Shape (`border-shape`)**: Single source of truth for corner radius across all elements is `border-shape` (`border-radius: var(--border-shape, 2px)`). Arbitrary `rounded`, `rounded-corner-xs`, `rounded-sm`, `rounded-md`, `rounded-lg` are strictly banned.
- **Button Loading State Standard**: During action loading (`isSaving()`, `isUploading()`, etc.), render **only the spinner** (`<mat-progress-spinner mode="indeterminate" diameter="18" />`). Never display text alongside a spinner. Swap the label/icon cleanly with `@if (isLoading()) { <mat-progress-spinner ... /> } @else { <mat-icon ... /> <span>Label</span> }` and provide `[attr.aria-label]="isLoading() ? 'Action...' : null"` for screen readers.
- **United Button Icon Sizing**: All `<mat-icon>` placed inside buttons (`matButton`, `matIconButton`, or native `<button>`) automatically default to `DEFAULT_BUTTON_ICON_SIZE` (`'lg'`) via `MatIconDirective` and `.mat-mdc-button-base mat-icon`. Never write `size="..."` on any icon inside a button.
- **Universal Plain-Language Microcopy**: All user- and admin-facing copy (buttons, dialogs, snackbars, alerts, hints, empty states) must speak the natural, everyday language of general users. Always communicate user intent and real-world outcomes rather than technical mechanisms, developer jargon, or underlying systems. Keep action labels simple, familiar, and active, and ensure all feedback is constructive, reassuring, and intuitive. Names of payment methods and order statuses are written as names, with capitals on the main words and small connecting words: **InstaPay**, **Card**, **Cash on Delivery**, **Waiting for Payment**, **Payment Failed** (also inside sentences, emails and server messages). Buttons, menu items and dialog actions use the same title case: capitals on the main words, small connecting words (a, an, the, and, or, of, on, in, at, to, by, for, with, from) in lower case unless first or last, brand words as written ("Place Order", "Add to Bag", "Send on WhatsApp", "Message Us on WhatsApp", "Sign In", "Back to the Store"). Sentences, hints, snackbars, aria-labels and status badges such as "In stock" / "Not set" stay sentence case. Full house style: the **`copywriting`** skill.
- **The Reference**: Activate the **`design-system`** skill for the styling directory map, token registration, Material overrides, and component APIs.

### 📐 Layout & Viewport Sizing Standards

1. **Top-Level Query Container**:
   - `<main>` inside `main.component.html` carries `@container`. Page-level sections and cards must use `cqw` to remain fluid relative to drawer open/close and responsive main layouts.
   - Never place `@container` on the same element where `cqw` padding is declared (CSS cannot query itself).
   - The admin `<main>` in `admin-layout.component.html` carries `@container` too, so admin pages' `@3xl` / `@5xl` rules measure the content width (before, nothing on admin pages had a container and those rules never applied).
2. **Angular Component Host Sizing**:
   - All section and page components (`app-*-section`, `app-*`) must define `host: { class: 'block w-full' }` in `@Component()` to prevent `display: inline` height/width collapse.
3. **Full-Viewport Sections**:
 - Full-screen heroes directly below the stacked top chrome must use `h-[calc(100dvh-var(--storefront-top-chrome,56px))]`. `--storefront-top-chrome` is measured from the announcement bar + desktop nav stack (fallback `56px` / `h-14` when chrome is not mounted).
 - When a full-height hero is specified, do NOT add `aspect-*` (`aspect-video`, `aspect-21/9`) to the slide containers, as `aspect-ratio` overrides height in modern CSS.
4. **Section Spacing**:
   - Use `.container-content` as the single unified class for page section layout and responsive container padding (`p-[5cqw]`). Do not append `.section-space` to elements that already have `.container-content`.

### 🛡️ Data Validation (active) & Firebase (target state)

- **Strict Validation — ACTIVE**: `valibot` is installed and in use (`src/app/shared/schemas/`, `src/app/shared/ui/status-badge/status.model.ts`). Pipe all external data through a schema (`v.parse()` / `v.safeParse()`) before use. Use `createValibotConverter()` for Firestore documents (it reads a pending `serverTimestamp()` as Firestore's local estimate, so a live listener never parses `null` for it). See the **`typescript`** skill for the schema rules.

> [!IMPORTANT]
> **Native Firebase JS SDK (`firebase`) is standard.** Do NOT install or use `@angular/fire`. Native Firebase SDK functions (`getDoc`, `signInWithEmailAndPassword`, `onSnapshot`) are framework-agnostic, take explicit instances, and do NOT require an Angular injection context or `runInContext()` wrappers. Storage and Functions are not registered at startup. `injectStorageAsync()` and `injectFunctionsAsync()` (`@core/firebase`, region `europe-west3`) return a loader. Call them from an injection context, store the function, and invoke it on each use. A successful SDK load is reused. A failed chunk load is dropped so the next call retries.

- **Roles (admin, staff), Settings → Team, sign-in, create account, terms, confirm your email, delete account, saving guest orders to an account, and who may read or write each collection and Storage folder**: read the `auth-and-access` skill.
- **Guest checkout on the server, orderViews, Delete Order**: read the `checkout-and-orders` skill.
- **Returns & Exchanges (requests, the order's `returns` summary, return emails)**: read the `returns-and-exchanges` skill.
- **Delete Product and the admin Products list (Move to Category, Live / Hidden)**: read the `catalogue` skill.
- **Previous Versions of settings/navigation and settings/home**: read the `navigation-and-home` skill.
- **Own sign-in domain and the /__/auth proxy**: read the `seo-and-hosting` skill.

- **Signals & Resources Integration**:
  - One-off reads (`getDoc`, `getDocs`): Feed directly into `resource()`.
  - Dynamic queries: Feed `onSnapshot` into `rxResource()`.
  - Static query listeners: Use `signalCollection()` or `signalDoc()`.
  - Updates automatically trigger zoneless change detection.
- **Query Efficiency**: Always apply `limit(n)` on list queries and use `getCountFromServer()` for counts.
- **Pagination**: cursor-based. `PaginationServiceInterface<T>` (`src/app/shared/ui/reusable-table/table.model.ts`): with a pagination service, `ReusableTable` sorts on the server through `setQuery(where, sorts)` and `sort()`. Without one it pages and sorts the rows it was given in the browser.

- **LIFT Structure**: Feature modules live in `src/app/features/[feature-name]/`. Co-locate template and style files inside `<name>/<name>.component.*`. When a feature or page has dedicated services, utils, dialogs, or subcomponents, organize them in explicit subfolders (`services/`, `utils/`, `dialogs/`, `components/`) to eliminate root folder clutter. Do NOT generate or write `.spec.ts` test files.
- **SEO Metadata**: Inject and configure `SeoService` ONLY inside top-level Route/Page components in `ngOnInit()`.
- **Canonical and share tags, share pictures, sitemap**: read the `seo-and-hosting` skill.
- **Performance (@defer)**:
  - Below-the-fold content: `@defer (hydrate on viewport)`.
  - Completely static content: `@defer (hydrate never)`.
  - Above-the-fold / Hero / LCP content: Do NOT defer.

### 🖼️ Image Delivery & Optimization Architecture (ImageKit + Firebase Storage + Cloud Functions)

- **Image storage, the ImageKit proxy, dev and prod image hosts, uploads, galleries and image import**: read the `image-delivery` skill.
- **Strictly use `NgOptimizedImage` (`[ngSrc]`) paired with `AppImageFallbackDirective` (`[appImageFallback]`)** for all storefront and preview media. Raw `<img [src]>` for media assets is banned.
- Never build Storage or ImageKit URLs by hand; always use `normalizeImageKitPath()`, `buildImageKitUrl()`, and `buildStorageUrl()` from `@shared/utils/image`.
- **Skeleton Placeholders vs Blocking Spinners**:
  - Use `<app-skeleton>` (`@shared/ui/skeleton`) or `.skeleton` for layout/content placeholders (`@defer` placeholders, `resource.isLoading()` cards/lists/text) to prevent Cumulative Layout Shift (CLS).
  - Reserve `<mat-progress-spinner>` and `<app-loader>` for active button actions or blocking overlays.

### Storefront shell (first load)

- **Storefront async UI:** Activate the **`storefront-loading`** skill when adding or changing settings-driven chrome, geo/currency-dependent copy, or Firestore-backed SSR route bodies — it holds the full anti-flicker tier checklist (do not duplicate here).
- **ShellReadyService, announcement bar, footer, account panel and /account, shopping bag, Bundle & Save page, product grid first row, search panel, closed phone panels, focus chrome**: read the `storefront-chrome` skill.
- **Brands page, navigation link targets, columns that fill themselves**: read the `navigation-and-home` skill.

### Storefront motion (GSAP)

- `app-navigation-list-section` is the first storefront GSAP animation. Load `gsap` inside `afterNextRender` (never during server rendering), scope tweens with `gsap.context` on the component host, and `revert()` that context on destroy.
- **The navigation list section, home row scroll lock, home server seed, Home Page links and saved copies**: read the `navigation-and-home` skill.

### Meta Pixel (ads tracking)

- `MetaPixelService` (`@core/services/analytics/meta-pixel.service`) sends the client's Meta Pixel events (<KEY>-290). It runs in the browser only and only when `environment.metaPixelId` is set, which is the live store (`environment.prod.ts`); dev sends nothing.
- `provideAppInitializer` in `app.config.ts` calls `start()`, which sends PageView once per path (query-only changes and `/admin` pages are skipped) and loads Meta's script on the first store page, never on `/admin`.
- Events and where they are sent: ViewContent (product page, once per product), Search (search page, once per query), AddToCart (`app-add-to-bag-button` and the Bundle & Save page), InitiateCheckout (checkout, once the bag is priced), AddPaymentInfo (first payment pick, or Place Order), Purchase (after Place Order for InstaPay, Cash on Delivery and Bank Transfer; on the order page within 2 hours of a Card payment).
- Money goes to Meta in EGP with product ids. Free gift lines are left out of Purchase. Purchase is sent once per order per browser (`metaPixelPurchases` in localStorage) with event id `purchase-<orderId>`, ready for Conversions API de-duplication.
- Nothing goes to Meta while the address bar holds a guest order's `?key=`, also inside an encoded `returnUrl` (it opens the order with the guest's address), or an order page address with Paymob's return details (also inside a `returnUrl`). The order page clears both from its address, and the Card Purchase waits for that. Meta's own PageView on history changes (`disablePushState`) and its automatic events (`autoConfig`) are off, so only the service's events are sent.
- Set `localStorage.metaPixelDebug = '1'` in a browser to print every event in the console (works on dev, where nothing is sent).
- New shop actions that matter to ads call `MetaPixelService.track()` with a Meta standard event; never add Meta's snippet to `index.html`. The privacy page's cookies section must stay in line with what is sent.

### 📝 Living Documentation Directive

- All agent documentation (`AGENTS.md`, `.agents/skills/`, `.agents/rules/`, `.agents/workflows/`, `.claude/`, `.cursor/rules/`) is a living contract. Shared skills stay in `.agents/skills/` (Cursor loads that folder). Cursor-only sources: `.cursor/rules/design-system.mdc` (body synced to `.agents/rules/design-system.md`) and `.cursor/skills/` for `sync-docs`, `ask`, and `teacher` (`ask` / `teacher` / `sync-docs` bodies sync to `.agents/workflows/` via `npm run sync:agents`, so Antigravity gets them as workflows). After editing any mirrored source, run `npm run sync:agents`. **Edit only the sources.** `.claude/skills/`, `.claude/rules/`, `.agents/rules/`, and `.agents/workflows/` are generated copies that `npm run sync:agents` overwrites, and `npm run preflight` fails when they drift. Put a shared skill in `.agents/skills/` (copied to `.claude/skills/`) and a Cursor-only skill in `.cursor/skills/`.
- **Claude Code hooks (edits to generated copies and raw Firebase CLI deploy commands are blocked; put text that mentions a deploy in a file first) and the ticket-qa and money-path-reviewer subagents**: read the `ci-review-loop` skill.
- **One fact per line.** Write each rule in agent docs as its own line (a list item under a heading), and put a new rule on a new line, never at the end of an existing paragraph. Git merges line by line, so two PRs that edit the same long line conflict even when they change different sentences (the old 30,000-character Offers line conflicted on almost every offers PR; it now lives in the `offers` skill, <KEY>-157). A topic that outgrows a few lines in AGENTS.md moves to its own skill with a one-line pointer here.
- Any new technology, service, utility, or architectural pattern added must be documented immediately in the relevant `.agents/skills/` files (`reusable-catalog`, `new-feature`, etc.) and `AGENTS.md` before concluding the task.

---

## 🗂️ 2. Task Board & Branch Workflow

### Task board (Linear) — keep it in sync, always

The single source of truth for work is Linear. Workspace, team, team key and project names live in **`linear.config.json`** at the repo root (read it; never hard-code them in docs). Issue ids are `<KEY>-123`, where `<KEY>` is that file's `teamKey`. Linear builds the id from the team key, not from the team or project name, so renaming the team or project changes no ids; a key change is a one-line edit to `teamKey` (move the old key into `previousTeamKeys`, which the branch hook still blocks and `npm run preflight` flags in docs). Statuses (board columns), in order: **Backlog → Bugs → Todo → In Progress → To Review → QA → Done**, plus **Blocked** (waiting on someone else), **Canceled** and **Duplicate**. **Bugs** holds open bugs nobody has started (Linear's Unstarted group, next to Todo). Every issue sits in exactly one column. Labels say what kind of work it is: `Bug`, `Feature`, `Improvement`, `Open Questions`. The old `Blocked` label is replaced by the **Blocked** column; don't add it. The Todoist board was retired on Nov 6, 2026 and old `AS-xx` ids come from the earlier Cursor board; both only appear in issue descriptions and commit history.

Every agent (Claude Code, Cursor, Antigravity) updates the board as part of the task, not afterwards:

1. **Start**: find the matching issue (search the project first, so you never create a duplicate) and move it to **In Progress**. If there is none, create it in the project named in `linear.config.json` with a one-line description. Not for tickets handed to `npm run agent:build`: those stay unclaimed for the cloud session (see **Writing tickets** below).
2. **Branch, commit and PR**: name the branch `<type>/<short-name>`, where `<short-name>` is 2–5 lowercase words joined by hyphens (50 characters at most in total) and `<type>` is one of `feature/` (new feature or visible improvement), `fix/` (a bug or anything broken), `hotfix/` (urgent fix for the live site; branches from `main`, see **Release flow**), `refactor/` (no behaviour change), `perf/` (speed, bundle size, Lighthouse), `docs/` (agent docs, skills, READMEs only), `test/` (tests only), `chore/` (dependencies, config, scripts, cleanup) or `ci/` (GitHub Actions and deploy scripts). Pick the type of the main change; when a branch does several things, the one that matters most to the user wins (`fix/` beats `refactor/`, `feature/` beats `chore/`). Examples: `feature/shipping-weights`, `fix/sign-in-errors`. `feat/` and `bugfix/` are not allowed. No username, Linear id or date in the branch, and ignore Linear's suggested `youssefathalla/<key>-123-…` name. Because the branch no longer carries the id, **the PR title is what links the PR to Linear**:
   - **PR title starts with the issue id**: `<KEY>-123 Clear sign-in errors on mode switch` (several issues: `<KEY>-31 <KEY>-32 …`). This attaches the PR and drives the status automation. The `PR title` GitHub check (`.github/workflows/pr-title.yml`) reads `teamKey` from `linear.config.json` and fails a PR into `develop` or `main` whose title has no `<KEY>-` plus a number; PRs from `develop` or `main` themselves are skipped.
   - **PR description's first line is `Linear: [<KEY>-123](https://linear.app/<workspace>/issue/<KEY>-123)`**, with `workspace` and `teamKey` from `linear.config.json`: a clickable link to the issue (GitHub's autolinks for `<KEY>-123` need a paid plan on a private repo, and a PR title can't hold a link) and a backup link for Linear, which still reads the id inside it. Never write "Fixes <KEY>-123", "Closes <KEY>-123" or other closing words: they mark the issue Done on merge into `develop` and skip QA.
   - **Commit messages start with the issue id**: `<KEY>-123 Short summary`.
   - Still comment on the issue with the PR link after opening it (step 3).

   Full rule: the **`branch-naming`** skill. A Claude Code `PreToolUse` hook (`.claude/settings.json`) and a Cursor `beforeShellExecution` hook (`.cursor/hooks.json`) run `scripts/hooks/check-branch-name.mjs` and block a branch create or rename that breaks it, and a `gh pr create` / `gh pr edit` whose `--title` has no `<KEY>-123` (a title from a variable or `--fill` passes there; the `PR Title` check on GitHub still catches it). Antigravity has no agent hook wired in this repo, so follow the skill by hand there; the git hook below and the `PR Title` check apply to every tool.
   - **Pre-push git hook (what it blocks and runs, SKIP_PUSH_CHECKS, --no-verify)**: read the `ci-review-loop` skill.
3. **PR opened**: move it to **To Review**, add a comment with the PR link and a one-line summary, and copy the PR's **How to Test on Dev** section to the end of the issue description (see below).
4. **Pushed or merged to `develop`**: move it to **QA** with a comment saying what was deployed or run and any deploy step still needed (`fb:rules:dev`, `fb:fn:dev`, Rebuild search, …). When the local manager agent merged or manages the change, it runs those dev steps itself (see **Deploy safety**) and says in the QA comment what it ran; cloud build sessions only list them.
5. **Verified, or merged to `main`**: move it to **Done**.
6. **Prod needs**: append every merged change's prod step to the checklist in the "Prod rollout" issue.
7. **Found along the way**: create an issue with the `Bug` label for a bug (status **Bugs**) or the `Open Questions` label for an undecided choice (status **Backlog**). Never only in chat. When work on a bug starts it moves to **In Progress** like any issue and keeps the `Bug` label.
8. **Blocked on someone else** (usually the client): move it to **Blocked** and comment exactly what is needed, what to do once it arrives, and which status it goes back to (the one it was in, e.g. **QA**). Code that is complete can still be merged. When the missing piece lands, move it back to that status and carry on.
9. **No stale issues**: when work makes an issue outdated, done, or wrong, update its description, or move it to **Done** / **Canceled** with a comment that says why, in the same issue.

**How to Test on Dev (<KEY>-87).** Every PR an agent opens carries a `## How to Test on Dev` section (time, Setup, 3 to 6 `- [ ]` steps), copied to the end of the Linear issue; the exact format is in the **`linear-board`** skill.

If Linear can't be reached (tool missing or signed out), say so in the final message and list the exact board changes still needed. Never skip them silently.

**Writing tickets, the ticket-pickup routine, `npm run agent:build`, model labels and the routine self-review** are in the **`linear-board`** skill. Read it before creating any Linear issue.

### Branches and merges

> [!IMPORTANT]
> **The store is live (launched Nov 12, 2026).** `main` is what shoppers see on https://atteyastore.com (www redirects there). `develop` is the dev site.

**Release flow (after launch):**

- All work still goes to `develop` (squash-merged PRs, auto-merge), is deployed to dev and tested there in **QA**. Nothing reaches shoppers until it is released.
- A release is a `develop` → `main` PR with **"Create a merge commit"** (never squash). An agent opens it when Youssef asks to release, listing the tickets it contains and every prod step it needs (`fb:fn:prod`, `fb:rules:prod`, a data script, Rebuild search).
- Youssef merges the release PR himself: auto mode refuses merges into `main` and every `fb:*:prod` deploy, and auto-merge never merges into `main`.
- After the merge, App Hosting rolls `main` out to the live site on its own (a few minutes). Youssef then runs the prod steps listed on the PR, in this order: `npm run fb:rules:prod`, then `npm run fb:fn:prod` (answer N to delete prompts unless agreed).
- A release with functions or rules changes is not complete until those prod deploys ran: the website calls the new functions as soon as it rolls out, so run them right after the merge.
- Every merged change's prod need still goes on the "Prod rollout" issue (board step 6) until it is released.
- The board's **QA** step stays "merged to `develop` + dev deploy"; an issue moves to **Done** once it is checked on dev or released to `main` (board step 5).
- Dev deploys run from an up-to-date `develop` and prod deploys from an up-to-date `main` (`DEPLOY_BRANCH` in `scripts/firebase-guard.mjs`; kept this way at launch so dev is always tested before prod).
- **GitHub's default branch stays `develop`; App Hosting serves `develop` on dev and `main` on prod**: read the `ci-review-loop` skill.
- **Hotfix** (something broken on the live site that can't wait for the next release): branch `hotfix/<name>` from `origin/main`, PR into `main` (Youssef merges), run any prod step, then open a `main` → `develop` PR with the `no-auto-merge` label and merge it with **"Create a merge commit"**, so `develop` gets the fix and the history stays joined.

- `main` (the live store) and `develop` (the dev site, where all work lands) are long-lived. Working branches (`feature/…`, `fix/…`, `hotfix/…`, `refactor/…`, `perf/…`, `docs/…`, `test/…`, `chore/…`, `ci/…`; see the **`branch-naming`** skill) come off `develop`, and their PRs target `develop`.
- Claude Code creates worktrees in `.claude/worktrees/` (gitignored). `.claude/settings.json` sets `worktree.baseRef: "head"` so they start from the main project folder's checkout instead of `main`, so keep that folder on an up-to-date `develop`.
- **Squash** feature PRs into `develop`. Use **"Create a merge commit"** (never squash) for `develop` → `main` and for any PR that brings `main` back into `develop`. A squash there drops the shared history, and the next `develop` → `main` PR conflicts even when the files already match.
- **Claude review, Claude Fix, auto-merge, Browser Check, Conflict Watch, branch deletion and every check and bot comment name**: read the `ci-review-loop` skill.
- Firebase deploys run only from an up-to-date deploy branch (see **Deploy safety**): dev from `develop`, prod from `main`.

---

## 🧠 3. Specialized Skills

Activate the dedicated skills from `.agents/skills/` on demand. `sync-docs`, `ask`, and `teacher` live in `.cursor/skills/` because Cursor does not load workflow files:

- **`new-feature`** for the end-to-end feature lifecycle, LIFT folder structure, and orchestration.
- **`branch-naming`** for git branch names (`<type>/<short-name>`: `feature`, `fix`, `hotfix`, `refactor`, `perf`, `docs`, `test`, `chore` or `ci`), and PR titles and commit messages that start with the Linear id (`<KEY>-123 …`, `teamKey` in `linear.config.json`) so the Linear link keeps working. Load it before creating, naming or renaming a branch, writing a commit message, or opening a PR.
- **`reusable-catalog`** for the living index of shared UI components, extracted Tailwind classes, and the "2+ Duplication Rule".
- **`ui-design-rules`** for the Component Decision Matrix (Shared UI vs Material vs Tailwind), monochrome identity, and token rules.
- **`dev-data-script`** (manual, local manager agent only) to run a `functions/scripts/` data script on dev: build, dry run, check against the ticket, `--apply` until `changed meanwhile 0`, Rebuild search, Linear QA comment and the prod checklist line.
- **`board-status`** for the status report: what shipped, what's building or in review, the next scheduled build, and what waits on Youssef.
- **`offers`** for every offer rule: the pricing engine, top banner, free gifts, Buy X Get Y, one discount per item, offer limits, the guards at Place Order and the offer data scripts. Read it before touching offers, pricing, the bag, checkout or the order callables.
- **`copywriting`** for the house writing style: title case for buttons and payment/status names, say each thing once, money and order-ref formats, and order messages that match the order's real state. Read it before writing any user-facing text, email or WhatsApp message.
- **`quality-standards`** for A11y guardrails (no fake buttons), ReDoS prevention, and SSR server route registration.
- **`preflight-gate`** (Pre-Flight Beast Mode Gate) for `npm run preflight` automated audit and the 7-Point Quality Gate before shipping.
- **`storefront-loading`** for storefront anti-flicker tiers, SSR/`TransferState` seeds, `ShellReadyService`, and async UI checklists.
- **`angular-developer`** for architecture, components, signals, forms, DI, HTTP, and routing.
- **`design-system`** for Tailwind v4, Material M3 token overrides, and style partial workflows.
- **`typescript`** for strict types, Valibot schemas, pure models, and logic utilities.
- **`sync-docs`** to audit recent changes and keep living catalogs in sync.
- **`ask`** (manual) for discussion-only brainstorming without file edits.
- **`teacher`** (manual) to guide implementation instead of writing the solution.

Topic skills (moved out of this file, <KEY>-282; one fact per line, add new rules there, not here):

- **`auth-and-access`** for sign-in, roles, Team, terms, confirm email, delete account and Firestore / Storage access.
- **`checkout-and-orders`** for the bag, checkout, payments, guest checkout, order stage and status, admin Orders.
- **`order-emails`** for order emails and their design.
- **`customers-admin`** for customer summaries and the admin Customers pages.
- **`returns-and-exchanges`** for return and exchange requests: who and when, kinds, statuses, gifts, refund and fee math, the stock plan, `requestReturn` / `cancelReturnRequest` and the return emails.
- **`catalogue`** for products, stock, the product editor and page, Shop tabs, search and catalogue data scripts.
- **`categories-brands-admin`** for the admin Categories & Brands page.
- **`shipping-and-currency`** for shipping boxes, weights and prices outside Egypt.
- **`navigation-and-home`** for navigation, the Brands page, the Home Page and Previous Versions.
- **`storefront-chrome`** for the store layout, bag, footer, account pages and error pages.
- **`seo-and-hosting`** for canonical and share tags, sitemap, auth proxy, allowed hosts, service worker.
- **`ci-review-loop`** for the pre-push hook, Claude review, Claude Fix, auto-merge and Browser Check.
- **`linear-board`** for writing tickets, How to Test on Dev, and the ticket-pickup routine.

## Learned User Preferences

- Develops with Cursor, Antigravity, and Claude Code; expects `.cursor`, `.agents`, and `.claude` agent docs to stay aligned—run `npm run sync:agents` after editing mirrored contract or workflow sources.
- Dropdowns and text fields use Angular Material (`mat-form-field` + `mat-select` / `matInput`), never native `<select>` or bare `<input>`; on phone every form control and toolbar button takes the full width.
- Develops on Windows; when the GitHub CLI is unavailable, authenticating to the GitHub REST API via `git credential fill` (bearer token) is acceptable.

## Learned Workspace Facts

- The Firebase Functions SDK ends every callable error message with the HTTP status (`"One item in your bag is out of stock. [400]"`). Show a callable's message only through `callableMessage(error)` (`@shared/utils/firebase/firebase-errors`), which removes that suffix and returns null for the SDK's own status text so the page shows its fallback.
- Firestore `set` with `{ merge: true }` deep-merges nested map fields. Do not patch scoped `settings/catalog` counts with dotted top-level keys in `set()` (for example `categories.<id>`); Firestore stores literal field names and the real `categories`/`brands`/`types` maps stop updating.

### Deploy

- **Deploy**: the web app ships through App Hosting rollouts (GitHub-connected backend `atteya-store`; production sets `APP_HOSTING_ENV=prod` in `apphosting.production.yaml`). Default Firestore database `locationId` is `europe-west3` on both Firebase projects. `npm run fb:deploy:dev|prod` deploys Firestore, Storage and Functions only. `APP_CHECK_ENFORCED` is read at runtime by `requireAppCheck` inside `requireRole`.
- **Deploy safety**: every Firebase deploy runs through `scripts/deploy.mjs` via `npm run fb:*`, which runs the branch guard (`scripts/firebase-guard.mjs`: clean tree on the project's deploy branch, matching its origin; `DEPLOY_BRANCH` is `develop` for dev and `main` for prod), the index check when indexes are included, a deploy summary, and (for prod) a typed `prod` confirmation. Use `npm run fb:deploy:dev|prod` for big features that change several of rules, indexes, storage, and functions at once; use the smaller `fb:indexes:*`, `fb:rules:*`, and `fb:fn:*` scripts for single-area changes. Read-only index reports: `npm run fb:indexes:check:dev|prod`. Do not use raw `firebase deploy`. Answer **N** to every Firebase delete prompt (indexes or functions) unless that exact deletion was agreed in the plan. Never pass `--force`. `firebase/firestore.indexes.json` is the single source of truth — add every new query index there in the same PR, never only via the console error link. **Who deploys and applies:** On dev (`atteya-store-dev`), the local manager agent runs data scripts (dry run first, shows the result, then `--apply`), admin tools such as Rebuild search when it can, and `npm run fb:*:dev` deploys after a change merges. On prod (`attiya-store`), it only does so when Youssef says so in chat for that exact step; otherwise Youssef runs prod himself. Cloud build sessions (the ticket routine) never run Firebase commands or `--apply`: they have no credentials. If a dry run shows anything unexpected (more or fewer documents than planned, products or fields the plan didn't name), stop and ask Youssef before `--apply`.
- Functions deploy requires a gitignored `functions/.env` copied from `functions/.env.example` (the example file is not loaded); it supplies `defineString`/`defineBoolean` values at deploy time (`APP_CHECK_ENFORCED`, `ALGOLIA_APP_ID`, etc.). A missing file or value may surface as a generic CLI error—use `firebase deploy --debug` to see the param name.
- First deploy of gen2 Firestore triggers on a Firebase project can fail while Eventarc service-agent IAM propagates (HTTP 400 on trigger creation); wait a few minutes and retry functions-only deploy (`npm run fb:fn:dev` or `fb:fn:prod`).

## Cursor Cloud specific instructions

- Node 22 matches `.nvmrc`. `package.json` pins `packageManager` to npm `11.17.0`. If `npm -v` is not that version, install it with corepack into the prefix that owns `npm` before `npm ci`. npm 11 warns that `@firebase/util` and `protobufjs` postinstall scripts are outside root `allowScripts`; the storefront and the functions tests still run.
- Install both lockfiles: `npm ci` at the repo root and `npm ci --prefix functions`.
- There is no Firebase emulator suite. The dev server reads live `atteya-store-dev`, ImageKit, and Algolia through the public client config in `src/environments/environment.ts`. Do not deploy.
- `security.allowedHosts` in `angular.json` is empty, so SSR rejects every Host header until `NG_ALLOWED_HOSTS=localhost,127.0.0.1` is set. Set `NG_CLI_ANALYTICS=false` so `ng serve` does not wait on the analytics prompt. Serve with `npm run dev -- --host 0.0.0.0 --port 4200`, and skip that launch when `http://localhost:4200/` already succeeds.
- Checks: `npm run preflight` (pricing-engine sync, design/a11y scan, Prettier check, eslint). Code (`.ts`, `.html`, `.scss`, `.css`, `.js`, `.mjs`, `.cjs`) follows `.prettierrc` (`endOfLine: auto`). `.prettierignore` leaves out the generated copies, the generated currency tables, Markdown, JSON and YAML. `npm run format` fixes a failing `format:check`, and in Claude Code a `PostToolUse` hook (`scripts/hooks/format-edited-file.mjs`) formats each code file right after it is edited. GitHub Actions (`.github/workflows/ci.yml`) runs preflight, the cart tests, the development build, and the functions tests on every pull request and on pushes to `develop` and `main`. A docs-only or script-only PR (every changed file is `*.md`, under `.agents/`, `.claude/`, `.cursor/`, `docs/`, `functions/scripts/` or `scripts/` except `scripts/browser-check.mjs`, or `linear.config.json`) skips the development build, and skips the functions tests unless something under `functions/` changed; the job still reports "Build and Test", so auto-merge accepts it. The Angular app has no unit tests. In `functions/`, `npm test` compiles and runs the search-sync error tests. Development build: `npx ng build --configuration development`.
