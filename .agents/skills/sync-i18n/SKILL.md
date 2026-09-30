---
name: sync-i18n
description: Synchronizes en.json and ar.json translation files by adding missing keys and sorting them.
---

# 🌍 I18n Synchronization Skill

This skill ensures that your English (`en.json`) and Arabic (`ar.json`) translation files remain perfectly synchronized. It prevents runtime missing translation errors and keeps the codebase clean.

## 🚦 When to use this skill

Use this skill when:

1. The user reports "missing translations" or "raw keys" showing up in the UI.
2. You have added new text literals to a component and need to generate keys.
3. You want to ensure `en.json` and `ar.json` are consistent.

## 🎯 Objective

1. **Sync Keys**: Ensure every key exists in both language files.
2. **Mark Missing**: Fill missing translation values with `__MISSING_TRANSLATION__` so they are easily searchable.
3. **Sort**: Alphabetize keys to prevent git merge conflicts.

## 🛠️ Execution: Run the Script

This skill ships a deterministic script. **Always prefer it over hand-editing** — it cross-pollinates every language pair, marks gaps, sorts, and writes with 2-space indentation in one pass:

```bash
node .agents/skills/sync-i18n/scripts/sync.js
```

Run it from the repository root; it resolves `public/i18n` relative to the working directory and processes every `*.json` it finds there. It aborts before writing if any file fails to parse, so a syntax error can never overwrite good data.

After it runs:

1. Read the console output and report which keys were added.
2. Search the files for `__MISSING_TRANSLATION__` and fill in real translations.
3. Resolve any `[TYPE MISMATCH]` lines manually — the script logs them and skips them rather than guessing.

## 📐 Reference: What the Script Does

Only needed if the script is unavailable or you must reason about the result manually.

### 1. Read Translation Files

- Scan `public/i18n/*.json` to find `en.json` and `ar.json`.

### 2. Compare & Update

Perform a deep merge:

- **Deep Walk**: Traverse the JSON structure.
- **Missing in AR**: If `en.section.key` exists but `ar.section.key` does not, add it to `ar` with value `__MISSING_TRANSLATION__`.
- **Missing in EN**: If `ar.section.key` exists but `en.section.key` does not, add it to `en` with value `__MISSING_TRANSLATION__`.
- **Type Mismatch**: If a key is a string in one but an object in another, flag this as a critical error to the user.

### 3. Sort Keys

Sort all keys alphabetically at every level of nesting.
*Example:*

```json
{
  "auth": { ... },
  "dashboard": { ... },
  "settings": { ... }
}
```

### 4. Write Back

Write the formatted, sorted JSON back to each file with **2-space indentation** and a trailing newline.

## 🧪 Verification

After running, strictly verify:

1. Both files are valid JSON.
2. No keys were accidentally deleted (`git diff` should show additions and reordering only).
3. Every remaining `__MISSING_TRANSLATION__` is reported to the user — never leave one silently in place.
