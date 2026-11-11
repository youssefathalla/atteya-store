---
name: board-status
description: One plain-language status report for Youssef - what shipped, what is building, what is in review or QA, when the next scheduled build runs, and what is waiting on him. Use when Youssef asks "what's the status" or for a status update on the store.
argument-hint: '[since: today | yesterday | a date]'
---

# Store status report

Gather everything first, then write one short report. Read only: this skill changes nothing on
Linear, GitHub or Firebase.

## Gather

1. **Linear** (team and project from `linear.config.json`): list issues in **In Progress**,
   **To Review**, **QA**, **Blocked** and **Todo** with the `agent-ready` label. Also list issues moved
   to **Done** since `$ARGUMENTS` (default: today, Africa/Cairo time).
2. **GitHub** (`gh`, repo from `git remote get-url origin`):
   ```bash
   gh pr list --state open --json number,title,isDraft,headRefName,statusCheckRollup,labels
   gh pr list --state merged --search "merged:>=<date>" --json number,title,mergedAt
   ```
   For each open PR, note the latest bot comment titles (✋ / 🛑 / ⏳ / 🔀) because they say whether it
   is waiting for a person.
3. **Builds**: the Opus routine runs on the hour from 03:00 to 15:00 Cairo time
   (`CRON_TZ=Africa/Cairo 0 3-15 * * *`). Work out the next run from the current Cairo time. Sonnet and
   Haiku only run when started with `npm run agent:build`.
4. **Dev deploys**: check whether any merged change still needs a `fb:*:dev` deploy or a data script
   (look for "needs" or "deploy" in the QA comments of tickets merged today).

## Write

Plain language, no jargon, one line per item, ticket ids in front (`<KEY>-123`, `teamKey` in `linear.config.json`). Sections, skipping
empty ones:

- **Shipped** (Done or merged since the date)
- **Building now** (In Progress, with the PR link once there is one)
- **In review** (To Review: say what each one waits for, e.g. the Claude review, a fix round, a merge by hand
  for `.github/` changes)
- **Next build** (the next scheduled run and which ticket it will pick up first)
- **Waiting on Youssef**: numbered, each with what to do and my recommendation (this is the batched
  open-questions list; put every decision here, not in the other sections)

End with nothing else: no offers, no summary of the summary.
