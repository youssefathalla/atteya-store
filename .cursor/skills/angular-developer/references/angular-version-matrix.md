# 🗓️ Angular Version & Feature Evolution Matrix (v14 – v22+)

A definitive reference mapping when core features were introduced, stabilized, made default, or deprecated across Angular versions.

---

## 📊 Feature Timeline Matrix

| Feature                                         | Package                      | Introduced / Stabilized     | Status in Angular 22+                                 |
| :---------------------------------------------- | :--------------------------- | :-------------------------- | :---------------------------------------------------- |
| **Zoneless Reactivity**                         | `@angular/core`              | v20.0 (Exp), v20.2          | **Default engine** (No provider needed)               |
| **`resource()`**                                | `@angular/core`              | v19.0 (Exp), v22.1 (Stable) | **Active Standard** for async Promises                |
| **`rxResource()`**                              | `@angular/core/rxjs-interop` | v19.0 (Exp), v22.1 (Stable) | **Active Standard** for RxJS streams (`stream:`)      |
| **`httpResource()`**                            | `@angular/common/http`       | v19.2 (Exp), v22.1          | **Active Standard** for declarative HTTP              |
| **`ResourceSnapshot`**                          | `@angular/core`              | v21.2                       | **Active** (Serialization / SSR hydration)            |
| **`resourceFromSnapshots()`**                   | `@angular/core`              | v21.2                       | **Active** (Hydration of resource state)              |
| **`@Service` decorator**                        | `@angular/core`              | v21.0                       | **Active Standard** (Replaces `@Injectable`)          |
| **`withAutoCleanupInjectors()`**                | `@angular/router`            | v22.0 (Exp), v22.2 (Stable) | **Recommended** in `provideRouter()`                  |
| **Router `resources` (`nonBlocking`)**          | `@angular/router`            | v22.2                       | **Active Standard** (Replaces legacy resolvers)       |
| **Incremental Hydration**                       | `@angular/platform-browser`  | v19.0 (Exp), v20.0          | **Default** (`withIncrementalHydration()` deprecated) |
| **Event Replay**                                | `@angular/platform-browser`  | v18.0 (Exp), v20.0          | **Active** (`withEventReplay()` in hydration)         |
| **Fetch Engine for HTTP**                       | `@angular/common/http`       | v17.0 (via `withFetch()`)   | **Default** (`withFetch()` deprecated)                |
| **`withXhr()`**                                 | `@angular/common/http`       | v22.0                       | **Active** (Opt-in when XHR progress is needed)       |
| **`injectAsync()`**                             | `@angular/core`              | v21.0                       | **Active** (Lazy-loaded service injection)            |
| **`debounced()`**                               | `@angular/core`              | v22.0                       | **Active** (Signal debounce primitive)                |
| **`provideBrowserGlobalErrorListeners()`**      | `@angular/core`              | v21.0                       | **Active Standard** in `appConfig`                    |
| **`AngularAppEngine` / `AngularNodeAppEngine`** | `@angular/ssr`               | v19.0                       | **Active Standard** in `src/server.ts`                |
| **Default `OnPush` Strategy**                   | `@angular/core`              | v21.0                       | **Default** for all standalone components             |
| **Standalone Components**                       | `@angular/core`              | v14.0 (Exp), v15.0          | **Default** (`standalone: true` omitted)              |
| **Signal Forms**                                | `@angular/forms`             | v21.0 (Exp), v22.0          | Modern signal-based form handling                     |
| **Angular Aria**                                | `@angular/aria`              | v19.0                       | Headless accessible UI primitives                     |
| **Control Flow (`@if`, `@for`, `@let`)**        | `@angular/core`              | v17.0 (`@let` v18.1)        | **Active Standard** (`*ngIf`, `*ngFor` banned)        |
| **Signal Inputs/Outputs/Queries**               | `@angular/core`              | v17.1 – v17.3               | **Active Standard** (Replaced `@Input/@Output`)       |
| **`linkedSignal()`**                            | `@angular/core`              | v19.0                       | **Active Standard** (Writable dependent state)        |
| **JSONP (`withJsonpSupport`)**                  | `@angular/common/http`       | v15.0                       | **Deprecated** in v22.1 (XSS hazard)                  |
| **Class Guards (`CanActivate`, etc.)**          | `@angular/router`            | v15.2 (Deprecated)          | **Banned** (Use functional guards)                    |
| **Class Resolvers (`Resolve`)**                 | `@angular/router`            | v15.2 (Deprecated)          | **Banned** (Use Router Resources / inputs)            |

---

## 🏛️ Rules for Angular 22 Boilerplates

### 1. What is NOT Needed in `app.config.ts` (Defaults)

- ❌ `provideZonelessChangeDetection()`: Zoneless change detection is injected by Angular core bootstrap by default.
- ❌ `withIncrementalHydration()` & `withEventReplay()`: Calling `provideClientHydration()` with zero arguments already enables DOM hydration, HttpTransferCache, Incremental Hydration, AND Event Replay by default!
- ❌ `provideHttpClient()`: `HttpClient` is provided in root by default. Calling `provideHttpClient(...)` is optional and only needed when configuring interceptors, XSRF tokens, or `withXhr()`.
- ❌ `withFetch()`: The fetch API is the default HTTP engine.
- ❌ `standalone: true`: Components are standalone by default.
- ❌ `changeDetection: ChangeDetectionStrategy.OnPush`: Components default to `OnPush`.

### 2. What is Configured in `app.config.ts`

- **`provideClientHydration()`**: Zero arguments needed! Enables DOM reconciliation, Transfer Cache, Incremental Hydration, and Event Replay.
- **`provideRouter(routes, ...)`**: Add feature flags like `withComponentInputBinding()`, `withAutoCleanupInjectors()`, `withViewTransitions()`, and `withInMemoryScrolling()`.
- **`provideBrowserGlobalErrorListeners()`**: Forward uncaught browser window errors and unhandled promise rejections to Angular's `ErrorHandler`.
