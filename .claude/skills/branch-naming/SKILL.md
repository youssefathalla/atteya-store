---
name: branch-naming
description: The git branch, PR title and commit message rules for Atteya Store (feature/<short-name> or fix/<short-name>; PR title and commits start with the Linear id YOU-123 so the Linear link keeps working). Load it whenever you are about to create, name or rename a git branch (git checkout -b, git switch -c, git branch, git worktree add -b), write a commit message, or open a pull request.
---

# Branch Names

Every working branch is named `<type>/<short-name>`.

| Type | Use it for |
| --- | --- |
| `feature/` | New features, improvements, copy changes, docs, agent docs, tooling, CI, refactors: anything that is not a bug fix. |
| `fix/` | A bug, or anything that is broken or behaves wrongly today. |

When in doubt: if the work makes something that is broken work again, it is `fix/`. Otherwise it is `feature/`. A Linear issue labelled `Bug` is `fix/`.

## The short name

- 2 to 5 lowercase words (`a-z`, `0-9`) joined by single hyphens, describing the change in plain words.
- No username, no Linear id, no dates, no capitals, no underscores, no dots.
- Keep the whole name at 50 characters or fewer.

| Good | Bad | Why it's bad |
| --- | --- | --- |
| `feature/shipping-weights` | `youssefathalla/you-123-shipping-weights` | Old format: username and Linear id |
| `fix/sign-in-errors` | `fix/you-45-sign-in-errors` | Linear id belongs in the PR title |
| `feature/simple-branch-names` | `feature/simple_branch_names` | Underscores |
| `fix/cart-total-rounding` | `bugfix/cart-total` | Only `feature/` and `fix/` |
| `feature/order-emails` | `feature/2026-11-06-order-emails` | Dates |
| `feature/admin-product-search` | `admin-search` | No type prefix |

`main` and `develop` are the long-lived branches and are exempt.

## Keep the Linear link working (required)

The branch no longer carries the issue id, so **the PR title is what attaches the PR to the Linear issue** and drives its status automation. Follow all four rules:

1. **PR title starts with the issue id**: `YOU-123 Clear sign-in errors on mode switch`. Several issues: `YOU-31 YOU-32 Shipping weights and box sizes`. The `PR title` check (`.github/workflows/pr-title.yml`) fails any PR into `develop` or `main` whose title has no `YOU-<number>` (PRs from `develop` or `main` themselves are skipped).
2. **PR description's first line is `Linear: YOU-123`** as a backup link. Never write closing words such as "Fixes YOU-123", "Closes YOU-123" or "Resolves YOU-123": they mark the issue Done when the PR merges into `develop`, which skips QA.
3. **After opening the PR, comment on the issue** with the PR link and a one-line summary, and move it to In Review (`AGENTS.md` section 2, step 3).
4. **Commit messages start with the issue id**: `YOU-123 Short summary`.

Ignore Linear's "Copy git branch name" suggestion (`youssefathalla/you-123-…`).

## Where branches start and end

- Branch off the latest `develop`: `git fetch origin` then `git switch -c feature/short-name origin/develop`.
- PRs target `develop` and are squash-merged (see `AGENTS.md` section 2).

## Enforcement

- **Claude Code**: a `PreToolUse` hook in `.claude/settings.json` runs `scripts/hooks/check-branch-name.mjs` on every Bash and PowerShell command. It blocks `git checkout -b`, `git switch -c`, `git branch <name>`, `git branch -m`, and `git worktree add -b` when the new name breaks this rule, and explains why. Rename and run it again.
- **Cursor**: the same script runs as a `beforeShellExecution` hook from `.cursor/hooks.json` (`--cursor` flag).
- Listing, switching to and deleting branches are never blocked. Branches Claude Code creates for its own isolated worktrees (`worktree-agent-…`) are not created through the shell, so the hook does not see them.
