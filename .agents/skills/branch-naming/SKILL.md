---
name: branch-naming
description: The git branch naming rule for Atteya Store (feature/<short-name> or fix/<short-name>, Linear id in the PR title). Load it whenever you are about to create, name or rename a git branch (git checkout -b, git switch -c, git branch, git worktree add -b) or open a pull request.
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
| `fix/sign-in-errors` | `fix/YOU-45-sign-in-errors` | Linear id belongs in the PR title |
| `feature/simple-branch-names` | `feature/simple_branch_names` | Underscores |
| `fix/cart-total-rounding` | `bugfix/cart-total` | Only `feature/` and `fix/` |
| `feature/order-emails` | `feature/2026-11-06-order-emails` | Dates |
| `feature/admin-product-search` | `admin-search` | No type prefix |

`main` and `develop` are the long-lived branches and are exempt.

## Linear id goes in the PR title

Put the issue id at the start of the PR title: `YOU-123 Clear sign-in errors on mode switch`. Linear's GitHub integration links the PR from the title and moves the issue. Commit messages may mention the id too. Ignore Linear's "Copy git branch name" suggestion (`youssefathalla/you-123-…`).

## Where branches start and end

- Branch off the latest `develop`: `git fetch origin` then `git switch -c feature/short-name origin/develop`.
- PRs target `develop` and are squash-merged (see `AGENTS.md` section 2).

## Enforcement

- **Claude Code**: a `PreToolUse` hook in `.claude/settings.json` runs `scripts/hooks/check-branch-name.mjs` on every Bash and PowerShell command. It blocks `git checkout -b`, `git switch -c`, `git branch <name>`, `git branch -m`, and `git worktree add -b` when the new name breaks this rule, and explains why. Rename and run it again.
- **Cursor**: the same script runs as a `beforeShellExecution` hook from `.cursor/hooks.json` (`--cursor` flag).
- Listing, switching to and deleting branches are never blocked. Branches Claude Code creates for its own isolated worktrees (`worktree-agent-…`) are not created through the shell, so the hook does not see them.
