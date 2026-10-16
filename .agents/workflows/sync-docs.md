---
description: Audit recent codebase changes and automatically synchronize all markdown documentation, living catalogs, and agent skills.
---

# 📚 Living Documentation Sync Workflow (`/sync-docs`)

> **Activation**: Run `/sync-docs` in chat whenever you finish a task, or during feature pre-flight reviews.

This workflow audits your workspace changes against the documentation contract (`AGENTS.md`, `.agents/skills/reusable-catalog/SKILL.md`, `.agents/rules/design-system.md`, and `.agents/skills/new-feature/SKILL.md`), identifies any undocumented building blocks, and automatically updates them.

---

## 🔍 Execution Protocol

When `/sync-docs` is triggered, execute these 5 steps in order:

### Step 1: Detect Workspace Changes

Run git status to detect all newly created or modified files:

```bash
git status -s
```

Inspect files in:

- `src/app/core/services/` (Services)
- `src/app/shared/ui/` (Components)
- `src/app/shared/utils/` (Logic utilities, validators, converters)
- `src/app/shared/schemas/` (Valibot schemas)
- `src/styles/tailwind/components/` (Extracted Tailwind v4 classes)
- `firebase/` (Firebase rules & config)
- `src/environments/` (Environment variables & external services)

---

### Step 2: Audit Against the Documentation Checklist

Check each newly added or updated item against the living docs:

1. **Core Services**:
   - Is it indexed in `reusable-catalog/SKILL.md` under **Section 3: Core Shared Services**?
   - Does it list the file path, public method signatures, and signal properties?
2. **Shared Utilities & Logic**:
   - Is it indexed in `reusable-catalog/SKILL.md` under **Section 6: Shared Logic & Breakpoint Utilities**?
3. **Shared UI Components**:
   - Is it indexed in `reusable-catalog/SKILL.md` under **Section 1: Shared UI Components** with usage snippets?
4. **Extracted Tailwind CSS Classes**:
   - Is it indexed in `reusable-catalog/SKILL.md` under **Section 2: Extracted Tailwind Classes** with its CSS file and description?
5. **Architectural Patterns & Integrations**:
   - Did we add or alter an external integration (ImageKit, Firebase Storage, Auth, etc.)?
   - Is the architecture documented under **Core Architectural Directives** in `AGENTS.md`?
   - Is the feature lifecycle updated in `new-feature/SKILL.md`?
   - Are styling guardrails reflected in `.agents/rules/design-system.md`?

---

### Step 3: Automatically Update Outdated Docs

If any item is missing or outdated:

- Use `replace_file_content` to surgically append or update the documentation.
- Maintain consistent formatting: table rows, bullet points, file paths, and accurate TypeScript/HTML examples.

---

### Step 4: Verification

Run the pre-flight quality check to ensure markdown changes didn't introduce syntax or lint errors:

```bash
npm run preflight
```

---

### Step 5: Deliver Documentation Sync Report

Provide a clean summary of what was checked and updated:

```markdown
## 📚 Living Documentation Sync Report

### 1. Scanned Changes
- [List of detected services, utilities, components, or classes]

### 2. Documentation Status
- ✅ **reusable-catalog**: [Up to date / Added: ServiceName, utilityName]
- ✅ **AGENTS.md**: [Up to date / Updated architectural directives]
- ✅ **new-feature**: [Up to date / Updated lifecycle steps]
- ✅ **design-system.md**: [Up to date]

### 3. Verification
- `npm run preflight`: PASSED (0 errors, 0 warnings)
```
