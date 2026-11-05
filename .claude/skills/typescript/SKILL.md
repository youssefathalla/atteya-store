---
name: typescript
description: Enforces strict TypeScript & Valibot modeling. Use it for types, interfaces, models, utils, or pure logic tasks that are not UI-related. Do not use for UI components or Angular templates.
---

# 🟦 TypeScript Pro Beast Mode

## 📝 Naming & File Conventions

- **Files**: `kebab-case.ts` (e.g., `user-profile.model.ts`).
- **Classes**: `PascalCase` matching the file name.
- **Interfaces**: No `I` prefix (e.g., `User`, not `IUser`).

## 🧠 Core Philosophy

 1. **Immutability**: All public data must be `readonly`.
 2. **No `any`**: Strictly forbidden. Use `unknown` + Type Guards.
 3. **DRY Types**: Use `Pick`, `Omit`, or `Partial` from the utility-types.
 4. **Strict Utility Types**:
    - Use `Record<string, T>` instead of `{[key: string]: T}`.
    - Use `ReadonlyArray<T>` instead of `T[]` for inputs.
    - Use The `satisfies` operator for specific validation without widening.

## 🛡️ Valibot & Modeling Rules

When generating models, use `valibot` to enforce strict validation with safe defaults:

- **Import**: `import * as v from 'valibot';`
- **Rule 1: Optional Defaults**: `v.optional(v.string(), '')` (Use for defaults. Input: `undefined` -> default. `null` -> Error).
- **Rule 2: Pointer Factory**:
  - Primitives: `v.optional(v.string(), '')`
  - Complex (Obj/Arr): `v.optional(Schema, () => v.getDefaults(Schema))` or `v.optional(v.array(v.string()), () => [])` (Fresh memory reference).
- **Rule 3: Fallback Safety**: `v.fallback(schema, default)` ONLY for API/Safety nets to silence errors. (Never wrap `v.getDefaults`).
- **Rule 4: Pipelines**: Use `v.pipe(v.string(), v.email())`.
- **Inference**: `export type User = v.InferOutput<typeof UserSchema>;`

## 📝 Syntax Rules

1. **Private**: Use `#internal` syntax (runtime private).
2. **Signals**: Public signals must be `Signal<T>` (read-only). Use `.asReadonly()`.
3. **Methods**: Prefer arrow functions for context safety if passing as callbacks.

## 🔒 Visibility: `#`, `protected`, or `private`?

The rules above are not in conflict — pick by who needs access:

- **`#field`** — internal state nothing else touches. This is the default.
- **`protected readonly`** — required when the **template** reads the member. Angular templates cannot access `#` fields.
- **`private`** — avoid. It is compile-time only; use `#` instead.

## 🛠️ Scripts

Run from the repository root. The directory argument is **required** — omitting it only prints usage:

```bash
node .agents/skills/typescript/scripts/audit-ts.js src/app
```

It reports `: any`, `private` fields that should be `#`, and publicly writable signals, with file and line numbers.
