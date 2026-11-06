---
name: branch-naming
description: The git branch, PR title and commit message rules for Atteya Store (<type>/<short-name> with type feature, fix, hotfix, refactor, perf, docs, test, chore or ci; PR title and commits start with the Linear id YOU-123 so the Linear link keeps working; worktrees only in .claude/worktrees/<name>). Load it whenever you are about to create, name or rename a git branch (git checkout -b, git switch -c, git branch, git worktree add), create or remove a worktree, write a commit message, or open a pull request.
---

# Branch Names

Every working branch is named `<type>/<short-name>`.

| Type | Use it for | Example |
| --- | --- | --- |
| `feature/` | A new feature or a visible improvement for shoppers or staff. | `feature/shipping-weights` |
| `fix/` | A bug, or anything that is broken or behaves wrongly today. | `fix/sign-in-errors` |
| `hotfix/` | An urgent fix that must ship on its own. After launch it branches from `main`; until then it comes off `develop` like everything else (develop-only rule in `AGENTS.md`). | `hotfix/checkout-total-zero` |
| `refactor/` | Restructuring code with no change in behaviour. | `refactor/order-stage-helpers` |
| `perf/` | Speed, bundle size, Lighthouse. | `perf/lazy-load-algolia` |
| `docs/` | Agent docs, `AGENTS.md`, skills and READMEs only. | `docs/branch-naming-rule` |
| `test/` | Tests only. | `test/order-messages-cases` |
| `chore/` | Dependencies, config, scripts, cleanup. | `chore/update-angular-deps` |
| `ci/` | GitHub Actions and deploy scripts. | `ci/pr-title-check` |

No other prefix is allowed: write `feature/`, not `feat/`, and `fix/`, not `bugfix/`.

## How to choose

Pick the type of the main change. If a branch does several things, use the one that matters most to the user: `fix/` beats `refactor/`, and `feature/` beats `chore/`. A Linear issue labelled `Bug` is `fix/` (or `hotfix/` when it can't wait).

## The short name

- 2 to 5 lowercase words (`a-z`, `0-9`) joined by single hyphens, describing the change in plain words.
- No username, no Linear id, no dates, no capitals, no underscores, no dots.
- Keep the whole name at 50 characters or fewer.

| Good | Bad | Why it's bad |
| --- | --- | --- |
| `feature/shipping-weights` | `youssefathalla/you-123-shipping-weights` | Old format: username and Linear id |
| `fix/sign-in-errors` | `fix/you-45-sign-in-errors` | Linear id belongs in the PR title |
| `feature/simple-branch-names` | `feature/simple_branch_names` | Underscores |
| `fix/cart-total-rounding` | `bugfix/cart-total` | Not an allowed type: use `fix/` |
| `feature/order-emails` | `feat/order-emails` | Not an allowed type: use `feature/` |
| `chore/update-firebase-sdk` | `chore/2026-11-06-firebase` | Dates |
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

- Branch off the latest `develop`: `git fetch origin` then `git switch -c feature/short-name origin/develop`. This includes `hotfix/` branches until launch.
- PRs target `develop` and are squash-merged (see `AGENTS.md` section 2).

## Worktrees (parallel sessions)

Use a worktree whenever another session may be working in the main project folder, so the two never touch each other's files or branch.

- **Location**: agent worktrees live only in `.claude/worktrees/<name>` inside the main project folder. Never a sibling folder (`../wt`), a temp folder, or a folder nested inside another worktree. `.claude/worktrees/` is in `.gitignore`.
- **Create** from the main project folder, named after the branch's short name:
  `git fetch origin` then `git worktree add .claude/worktrees/shipping-weights -b feature/shipping-weights origin/develop`
  From inside another worktree, use the full path `<main project folder>/.claude/worktrees/<name>` (or `../<name>`, which lands next to it).
- **Set up**: a worktree has no `node_modules`. Run `npm ci` (and `npm ci --prefix functions` when touching functions) before a build or `npm run preflight`.
- **Claude Code's own worktrees** (`claude --worktree`, subagents with `isolation: worktree`, `EnterWorktree`) already go to `.claude/worktrees/`. `.claude/settings.json` sets `worktree.baseRef` to `"head"`, so they start from the main folder's checkout instead of the stale `main`. Their branch is named `worktree-<name>`: before committing, create your working branch with `git switch -c <type>/<short-name> origin/develop`.
- **Main project folder**: keep it on an up-to-date `develop` (`git pull` before starting). Don't check out a working branch there while other sessions run; use a worktree.
- **Clean up** after the PR merges: `git worktree remove .claude/worktrees/<name>`, then `git branch -D <type>/<short-name>`. Check `git status` in the worktree first; never remove one that has uncommitted or unpushed work you didn't make.

## Enforcement

- **Claude Code**: a `PreToolUse` hook in `.claude/settings.json` runs `scripts/hooks/check-branch-name.mjs` on every Bash and PowerShell command. It blocks `git checkout -b`, `git switch -c`, `git branch <name>`, `git branch -m`, and `git worktree add -b` when the new name breaks this rule, and `git worktree add` / `git worktree move` to a path outside `.claude/worktrees/<name>`, and explains why. Fix it and run it again.
- **Cursor**: the same script runs as a `beforeShellExecution` hook from `.cursor/hooks.json` (`--cursor` flag).
- Listing, switching to and deleting branches are never blocked. Branches Claude Code creates for its own isolated worktrees (`worktree-agent-…`) are not created through the shell, so the hook does not see them.
