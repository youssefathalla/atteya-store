# Offers test run — Nov 10, 2026

Plan: `docs/qa/offers-test-scenarios.md`. Run: workflow `wf_aa27b51d-1c7` (Sonnet testers, every failure checked by Opus). Dev only.

## Results

| Part | Pass | Fail | Blocked | Notes |
| --- | --- | --- | --- | --- |
| Engine tests: item prices | 189 | 1 | – | The failure is the test's own mistake (J26 reading 0 back as null); fix the test before merging it |
| Engine tests: bag deals | 115 | 0 | – | |
| Engine tests: shipping and limits | 118 | 1 | – | Real bug, fixed in ATS-158 |
| Browser: setup | 1 | 0 | 0 | |
| Browser: admin form and list | 52 | 1 | 0 | M13 hint, fixed in ATS-160 |
| Browser: price offers | 42 | 2 | 6 | E8 fixed in ATS-162; Q3 see below; 6 blocked while the local store was down |
| Browser: Buy X Get Y | 30 | 0 | 1 | J24 race too fast to reproduce (the page caught it first, which is good) |
| Browser: free gifts | 21 | 0 | 1 | L21 needs a guest to sign in |
| Browser: shipping, limits, orders | 28 | 0 | 0 | M7, P7, P8 skipped: Card or Wallet not live |
| Browser: timing and banner | 15 | 0 | 1 | C11 needs a different laptop time zone |
| Browser: cleanup | 9 | 0 | 0 | Old prices restored on P1 and P3, QA offers deleted, test orders cancelled, bags emptied |

## Bugs found and where they went

| Finding | Ticket | State |
| --- | --- | --- |
| Free shipping offer with only "Except" rules gave free shipping to excluded products | ATS-158 | Merged, deployed to dev |
| Offer form: wrong Free shipping hint, dropdowns showing the wrong saved value, Buy X Get Y fields corrected silently, coupon wording in preview, Duplicate losing "(copy)" | ATS-160 | Merged |
| Audit log has no actor on offer delete | ATS-161 | Merged, deployed to dev |
| Product page ignores a size-only offer once a size is chosen (E8) | ATS-162 | Merged |
| Gift Box: focus goes to Size instead of the gift (L3) | ATS-163 | Queued (Sonnet, after ATS-162) |
| Checkout shows a sold-out gift as "Free" on first load; plural gift wording (L9) | ATS-164 | Queued (Opus) |
| Checkout says "Shipping EGP 0", confirmation says "Free" (M1) | ATS-165 | Queued (Sonnet, after ATS-164) |

## Not bugs, but worth a decision

- **Custom badge on a one-colour offer** reads "Black Friday in Black" (before ATS-168). It now reads "Black Friday · Black only".
- **J4 plan row is out of date**: one piece already shows "Add 2 more to get 1 free" (on purpose since ATS-148). Update the plan.
- **Q3 Shop card price lag**: after changing an offer from 10% to 30%, one Shop card kept the old price for minutes, while the product page and bag updated in seconds. The Opus check couldn't explain it from the code (the card reprices from the live offers listener). Recheck once. If it repeats, file a ticket.

## Still to rerun on dev

- The 6 price-offer rows blocked by the local outage: E11, F4, F5, G2, G3, I5
- E8 after ATS-162 (now deployed)
- The ATS-160 form checks (M13, A12–A14, J26, B9)
- Skipped rows that need things we don't have yet: Card or Wallet (M7, P7, P8), a two-colour test product (E9, E16), a sign-out or sign-in step (D4, L21)
