---
name: ngrx-signal-store
description: Expert in NgRx SignalStore. Use ONLY when the user explicitly asks for "Global State", "SignalStore", "NgRx", or "Shared Data" management.
---

# 📦 NgRx SignalStore Beast Mode

## ⚠️ Prerequisite: Not Installed Yet

`@ngrx/signals` is **not** a dependency of this project and there is no `signalStore` anywhere in `src/`. Before writing a store:

1. **Challenge the need.** Most state here belongs in a `@Service()` with `signal()` / `computed()` (see `src/app/core/services/` for the established pattern). Reach for SignalStore only for genuinely shared, collection-heavy state.
2. **Install it** and tell the user you are adding a dependency: `npm i @ngrx/signals` (pin a version compatible with the installed Angular major).

Never scaffold a store speculatively, and never assume the import resolves.

## ⚡ The "withProps" Mandate

**NEVER** use `inject()` inside `withMethods` or `withComputed`.
You **MUST** use `withProps` to consolidate all dependencies at the top of the store pipeline.

- **Why?** It keeps logic clean, makes mocking dependencies trivial, and serves as a "Manifest" of what the store uses.

## 🏗️ Architectural Rules

### 1. Structure Order (Strict)

Define your store in this exact order:

1. `withState` (Data)
2. `withEntities` (Collections)
3. `withProps` (Dependencies 💉)
4. `withComputed` (Derived)
5. `withMethods` (Actions)
6. `withHooks` (Lifecycle)

### 2. Async Actions (`rxMethod`)

- Use `rxMethod` for **ANY** side effect (API calls, debounce, tap).
- **Pipe Operator**: Always pipe the input: `rxMethod<void>(pipe(...))`.
- **Context**: Use the injected services from `withProps`.

### 3. Entity Management

- **Collections**: If managing a list, ALWAYS use `withEntities<T>()`.
- **Updaters**: Use `patchState(store, setAllEntities(...))` or `addEntity`.

### 4. Lifecycle

- **Initialization**: Use `withHooks { onInit }` to trigger initial data loads. **DO NOT** call methods in the constructor of the component using the store. The store should own its startup logic.

## 📄 Reference & Scripts

- **Canonical example**: `examples/book.store.ts` (in this skill folder) shows the full pipeline in the mandated order.
- **Cheatsheet**: `resources/cheatsheet.md`.
- **Audit**: `node .agents/skills/ngrx-signal-store/scripts/audit-store.js src/app` — flags `inject()` inside `withMethods` and manually managed arrays that should use `withEntities`. The path argument is optional and defaults to `src/app`.
