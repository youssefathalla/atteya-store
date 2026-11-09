---
name: dev-data-script
description: Run one of the one-off data scripts in functions/scripts/ on the dev Firebase project the safe way (build, dry run, check, apply until nothing changed meanwhile, then Rebuild search and the Linear QA comment). Use when a merged ticket needs a data script applied on dev.
disable-model-invocation: true
argument-hint: <script file in functions/scripts> [<KEY>-123]
---

# Run a data script on dev

For the local manager agent only. Cloud build sessions never run Firebase commands or `--apply`
(AGENTS.md, Deploy safety). This skill covers **dev (`atteya-store-dev`) only**. Prod (`attiya-store`)
needs Youssef's OK in chat for that exact step, every time; never run it from this skill.

Arguments: `$ARGUMENTS` is the script file name (for example `socks-one-colour.mjs`) and, optionally, the
Linear ticket id it belongs to.

## Steps

1. **Read the script's header comment first.** It names the flags, what it touches, what it skips, and
   anything to run before or after it (another script, Rebuild search, Check catalogue structure).
   If it says to run another script first, check that one has been applied on dev.
2. **Be on an up-to-date `develop`** with a clean tree, in the repo root:
   ```bash
   git switch develop && git pull --ff-only
   ```
3. **Build the functions** (the scripts import the compiled engine from `functions/lib/`):
   ```bash
   cd functions && npm run build
   ```
4. **Dry run** from `functions/`:
   ```bash
   node scripts/<script>.mjs --project atteya-store-dev
   ```
5. **Check the dry run against the ticket.** Count the documents and fields it would change and compare
   them with what the ticket and the script header say. **Stop and ask Youssef** when anything is
   unexpected: more or fewer documents than planned, products or fields the plan didn't name, an error,
   or a product listed as not found. Show him the relevant lines.
6. **Apply**:
   ```bash
   node scripts/<script>.mjs --project atteya-store-dev --apply
   ```
7. **Repeat the apply until the summary says `changed meanwhile 0`.** A product edited while the script
   ran (often by the colour-sibling trigger reacting to the script's own write) is skipped, not
   overwritten, and the next run picks it up. Re-running is safe: products that already match are left
   alone. If the count doesn't go down after three runs, stop and ask.
8. **Rebuild search** when the header asks for it: Admin → Products → Catalogue Tools → Rebuild search
   on the dev site. It needs an admin who is signed in, so ask Youssef to press it if you can't, and
   say so in the QA comment.
9. **Linear**: comment on the ticket with the exact commands you ran, the final summary line of each
   run, and what Youssef should check on the dev site. Then move it to **QA** if it isn't there yet.
10. **Prod**: add the same commands with `--project attiya-store --apply --confirm-prod`, plus any
    Rebuild search, to the checklist in the "Prod rollout" issue. Don't run them.

## Report back

One short message: the script, the dry-run counts, how many apply runs it took, the final summary line,
and anything left for Youssef (Rebuild search, a check on the dev site).
