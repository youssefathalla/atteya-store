# Async Reactivity with Resources (`resource` & `rxResource`) — Angular v22+

A `Resource` incorporates asynchronous data into Angular's signal-based code while allowing synchronous access. It eliminates manual loading state flags (`isLoading = signal(false)`, manual `try/catch`, manual `error = signal(...)`) with a unified reactive model.

---

## 1. One-Off Promises: `resource()`

Use `resource()` for one-time asynchronous operations (HTTP endpoints, Firebase `getDoc` / `getDocs`).

```ts
import { Component, computed, resource, signal, Signal } from '@angular/core';

@Component({ ... })
export class UserProfileComponent {
  readonly userId: Signal<string> = signal('123');

  readonly userResource = resource({
    // Reactive computation: re-evaluates whenever read signals change.
    params: () => ({ id: this.userId() }),

    // Async loader: called every time `params` changes.
    loader: async ({ params, abortSignal, previous }) => {
      const response = await fetch(`/api/users/${params.id}`, { signal: abortSignal });
      if (!response.ok) throw new Error('Network error');
      return response.json();
    },

    // SSR Caching (TransferState): prevents duplicate execution during client hydration
    id: 'user-profile-cache',
  });

  // Reading safely with hasValue()
  readonly firstName = computed(() => {
    if (this.userResource.hasValue()) {
      // hasValue() strips `undefined` AND protects against reading a throwing `value()` in error state
      return this.userResource.value().firstName;
    }
    return undefined;
  });
}
```

### Resource Status Signals & Methods

- `value()`: The resolved data. **Throws** if the resource is in an `'error'` state!
- `hasValue()`: Type guard boolean. Strips `undefined` and protects against reading a throwing `value()`.
- `isLoading()`: Boolean indicating if the loader is currently running.
- `error()`: The most recent error encountered, or `undefined`.
- `status()`: String constant: `'idle'`, `'loading'`, `'reloading'`, `'resolved'`, `'local'`, `'error'`.
- `reload()`: Programmatically forces the loader to run again.
- `snapshot`: A structured signal representation of the resource's current state.

---

## 2. Observable Streams: `rxResource()`

Use `rxResource()` (from `@angular/core/rxjs-interop`) for continuous Observables, WebSockets, or live Firebase `onSnapshot` listeners.

```ts
import { Component, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

@Component({ ... })
export class TaskListComponent {
  readonly status = input<string>('pending');

  readonly tasksResource = rxResource({
    params: () => ({ status: this.status() }),
    // Note: rxResource uses `stream:`, NOT `loader:`!
    stream: ({ params }) =>
      new Observable<Task[]>((subscriber) => {
        const q = query(collection(firestore, 'tasks'), where('status', '==', params.status));
        const unsubscribe = onSnapshot(
          q,
          (snap) => subscriber.next(snap.docs.map(d => d.data())),
          (err) => subscriber.error(err)
        );
        return () => unsubscribe();
      }),
  });
}
```

### 🚨 Critical Gotcha: Error `NG0991` (Stream Completed Without Value)

The Observable returned from `stream` **must emit at least one value or an error before completing**.

- ❌ **BAD:** `catchError(() => EMPTY)` — This hides the error and completes empty, causing Angular to throw `NG0991`.
- ✅ **Option A (Let error through):** Don't swallow the error. The resource will enter its `error()` state.
- ✅ **Option B (Recover with fallback):** Use `catchError(() => of(null))` so it emits a fallback value before completing.

---

## 3. Streaming with Native `resource({ stream })`

The core `resource()` function also natively supports `stream` by returning a signal:

```ts
const userUpdates = signal({ value: 'Alice' });
const userResource = resource({
  stream: () => userUpdates,
});

// When new data arrives:
userUpdates.set({ value: 'Bob' });
```

---

## 4. Chaining Resources (`chain`)

When one resource depends on the result of an upstream resource, use the `chain` function in `params`. It automatically propagates upstream status (`idle`, `loading`, `error`):

```ts
const userResource = resource({
  params: () => ({ id: getUserId() }),
  loader: ({ params }) => fetchUser(params.id),
});

const companyResource = resource({
  // Automatically mirrors userResource's loading and error states!
  params: ({ chain }) => chain(userResource)?.companyId,
  loader: ({ params: companyId }) => fetchCompany(companyId),
});
```

> [!NOTE]
> Pass the chained value directly (e.g. `chain(userResource)?.companyId`) rather than wrapping in an object (`{ companyId: ... }`), so an undefined value properly puts the downstream resource into `'idle'`.

---

## 5. SSR Caching with `id` (TransferState)

To prevent client hydration from re-executing the loader and re-fetching data already fetched on the server, assign a unique `id`:

```ts
const productResource = resource({
  params: () => ({ id: this.productId() }),
  loader: ({ params }) => fetchProduct(params.id),
  id: 'product-detail-cache',
});
```

> [!CAUTION]
> Avoid setting `id` for resources loading user-specific/sensitive private data if the rendered HTML can be shared across users or cached by a CDN.

---

## 6. Keeping Previous Value on Reload (`resourceFromSnapshots`)

By default, `.value()` becomes `undefined` while loading a new request. Use `resourceFromSnapshots` with `linkedSignal` to keep stale data while fetching:

```ts
import { linkedSignal, resourceFromSnapshots, Resource, ResourceSnapshot } from '@angular/core';

export function withPreviousValue<T>(input: Resource<T>): Resource<T> {
  const derived = linkedSignal<ResourceSnapshot<T>, ResourceSnapshot<T>>({
    source: input.snapshot,
    computation: (snap, previous) => {
      if (snap.status === 'loading' && previous && previous.value.status !== 'error') {
        return { status: 'loading' as const, value: previous.value.value };
      }
      return snap;
    },
  });
  return resourceFromSnapshots(derived);
}
```

---

## 7. Angular 22.2 Router Resources (Replacing Resolvers)

In Angular 22.2+, routes define a `resources` property instead of resolvers.

### Non-Blocking Route Resources (`nonBlocking`)

The route activates immediately, and the component receives the still-loading `Resource<T>` as an input:

```ts
// routes.ts
import { nonBlocking, Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: ':id',
    component: LuggageDetailComponent,
    resources: (ctx) => ({
      luggage: nonBlocking(createLuggageResource(ctx.params)),
    }),
  },
];
```

```ts
// luggage-detail.component.ts
import { Component, input, Resource } from '@angular/core';

@Component({ ... })
export class LuggageDetailComponent {
  readonly luggage = input.required<Resource<Luggage>>();
}
```

### Blocking Route Resources

Without `nonBlocking`, the router waits until the resource resolves before activating the route, binding the unwrapped data:

```ts
readonly luggage = input.required<Luggage>();
```

### Throwing `RedirectCommand`

In guards, resolvers, and resource loaders, throw redirects directly:

```ts
throw new RedirectCommand(router.parseUrl('/login'));
```
