---
name: branch-naming
description: The git branch, PR title and commit message rules for Atteya Store (<type>/<short-name> with type feature, fix, hotfix, refactor, perf, docs, test, chore or ci; PR title and commits start with the Linear issue id <KEY>-123, where <KEY> is teamKey in linear.config.json, so the Linear link keeps working). Load it whenever you are about to create, name or rename a git branch (git checkout -b, git switch -c, git branch, git worktree add -b), write a commit message, or open a pull request.
---

# Branch Names

Every working branch is named `<type>/<short-name>`.

| Type | Use it for | Example |
| --- | --- | --- |
| `feature/` | A new feature or a visible improvement for shoppers or staff. | `feature/shipping-weights` |
| `fix/` | A bug, or anything that is broken or behaves wrongly today. | `fix/sign-in-errors` |
| `hotfix/` | An urgent fix for the live site that can't wait for the next release. Branches from `main` and targets `main`, then `main` is merged back into `develop` (Release flow in `AGENTS.md`). | `hotfix/checkout-total-zero` |
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
| `feature/shipping-weights` | `youssefathalla/<key>-123-shipping-weights` | Old format: username and Linear id |
| `fix/sign-in-errors` | `fix/<key>-45-sign-in-errors` | Linear id belongs in the PR title |
| `feature/simple-branch-names` | `feature/simple_branch_names` | Underscores |
| `fix/cart-total-rounding` | `bugfix/cart-total` | Not an allowed type: use `fix/` |
| `feature/order-emails` | `feat/order-emails` | Not an allowed type: use `feature/` |
| `chore/update-firebase-sdk` | `chore/2026-11-06-firebase` | Dates |
| `feature/admin-product-search` | `admin-search` | No type prefix |

`main` and `develop` are the long-lived branches and are exempt.

## Keep the Linear link working (required)

The branch no longer carries the issue id, so **the PR title is what attaches the PR to the Linear issue** and drives its status automation.

**The issue key is not fixed.** `<KEY>` below is `teamKey` in `linear.config.json` at the repo root (read it before writing a title or commit; the Linear issue itself also shows its id). Linear builds ids from the team key, not the team or project name, so a rename of the team or project changes nothing here; only a team key change does, and then `teamKey` is the one line to edit (move the old key into `previousTeamKeys`). Never hard-code a key in docs: `npm run preflight` fails on one.

Follow all four rules:

1. **PR title starts with the issue id**: `<KEY>-123 Clear sign-in errors on mode switch`. Several issues: `<KEY>-31 <KEY>-32 Shipping weights and box sizes`. The `PR title` check (`.github/workflows/pr-title.yml`) reads `teamKey` from `linear.config.json` and fails any PR into `develop` or `main` whose title has no `<KEY>-` followed by a number (PRs from `develop` or `main` themselves are skipped).
2. **PR description's first line is `Linear: [<KEY>-123](https://linear.app/<workspace>/issue/<KEY>-123)`**, a clickable link to the issue (`workspace` and `teamKey` from `linear.config.json`). GitHub autolinks need a paid plan on a private repo and a PR title can't hold a link, so this line is where the click is. Linear still reads the id inside the link, so it also works as a backup link. Never write closing words such as "Fixes <KEY>-123", "Closes <KEY>-123" or "Resolves <KEY>-123": they mark the issue Done when the PR merges into `develop`, which skips QA.
3. **After opening the PR, comment on the issue** with the PR link and a one-line summary, and move it to To Review (`AGENTS.md` section 2, step 3). The PR body also has a `## How to Test on Dev` section (rough time, `Setup:`, 3 to 6 `- [ ]` steps), copied to the end of the issue description (`AGENTS.md`, "How to Test on Dev").
4. **Commit messages start with the issue id**: `<KEY>-123 Short summary`.

Ignore Linear's "Copy git branch name" suggestion (`youssefathalla/<key>-123-…`).

## Where branches start and end

- Branch off the latest `develop`: `git fetch origin` then `git switch -c feature/short-name origin/develop`.
- PRs target `develop` and are squash-merged (see `AGENTS.md` section 2).
- Exception, `hotfix/`: branch off `origin/main` and target `main`; afterwards `main` is merged into `develop` with a merge commit.

## Enforcement

- **Claude Code**: a `PreToolUse` hook in `.claude/settings.json` runs `scripts/hooks/check-branch-name.mjs` on every Bash and PowerShell command. It blocks `git checkout -b`, `git switch -c`, `git branch <name>`, `git branch -m`, and `git worktree add -b` when the new name breaks this rule (including an id with the current or a retired key from `linear.config.json`), and explains why. Rename and run it again.
- **Cursor**: the same script runs as a `beforeShellExecution` hook from `.cursor/hooks.json` (`--cursor` flag).
- **Antigravity**: no hook is wired for it in this repo, so nothing blocks a bad name there. Follow this skill by hand; the `PR title` check still applies to every tool.
- Listing, switching to and deleting branches are never blocked. Branches Claude Code creates for its own isolated worktrees (`worktree-agent-…`) are not created through the shell, so the hook does not see them.
