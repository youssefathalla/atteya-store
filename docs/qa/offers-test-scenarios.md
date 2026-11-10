# Offers test scenarios (Admin → Offers)

Every scenario we could find for offers, built from how the code works today (Nov 10, 2026: engine in `functions/src/offers/engine/`, admin editor in `src/app/features/admin/pages/offers-manager/`, order pricing in `functions/src/orders/order-pricing.server.ts`).

Test on the **dev site** only. Run one section at a time and **pause or archive every test offer before starting the next section**, so offers don't affect each other (section O is the one that tests offers together on purpose).

## How to read the table

- **Check in**: where to look. `Admin` = the offer form or list. `Shop` = product cards, product page, search (can be checked signed out). `Bag` = shopping bag. `Checkout` / `Order` = needs a signed-in shopper and placing an order (InstaPay or Cash on Delivery, Egypt address). An agent that can't sign in can only do the `Shop` checks and `Bag` checks as a guest.
- **Expected** is what the code should do today. Rows marked **⚠ Gap** are places where the code does something you may not want. Test them, and decide if each one is a bug (see "Known gaps" below).
- **Result**: write ✅, ❌ (with what you saw) or ⚠.
- After an offer change, the shop updates live in a few seconds. Shop and search **cards** take up to **15 minutes** for scheduled start/end times (the price refresh runs every 15 minutes), and the order server can be up to **60 seconds** behind an offer change.

## Test products to prepare

Pick real dev products and write their names here before starting. Prices are examples; adjust the expected numbers if yours differ.

| Name in this sheet | What it needs | Example |
| --- | --- | --- |
| **P1** | Normal product, no sale price, has sizes, in stock, price **1,000** | a T-shirt |
| **P2** | On sale: price **800**, old (compare-at) price **1,000** | any on-sale item |
| **P3** | Cheap item, price **200**, same category as P1 | socks, grip |
| **P4** | Different brand and category from P1 | a padel ball |
| **P5** | A product with **two colours** in its `colors` list (e.g. black + white), if one exists | — |
| **G1** | Gift product with sizes (shirt), published, in stock | — |
| **G2** | Gift product with no sizes (socks), published, in stock | — |
| **G3** | A gift product you can set to out of stock or unpublish | — |
| Accounts | Admin, Shopper A, Shopper B (both with accepted terms), plus a signed-out visitor | Admin: your Chrome on the dev site. Shopper A: built-in browser on the dev site. Shopper B: built-in browser on `localhost:4200`. Visitor: built-in browser on `127.0.0.1:4200`, never signed in (each address keeps its own sign-in) |

---

## Known gaps (found while reading the code; confirm while testing)

| # | What happens today | Why it matters |
| --- | --- | --- |
| K1 · ATS-131 | **Coupon codes never work.** "Requires a coupon code" saves the code, but the shop only loads public offers and checkout and the server never send a code. A code offer never discounts anything. | Staff may create a code offer and think it's live. |
| K2 · ATS-132 | **"Combining with other offers"** (Can combine / Exclusive) is saved but never used anywhere. | The setting does nothing. |
| K3 · ATS-133 | **Use limits** (Total uses, Uses per customer) are only counted for **Free gift** and **Buy X get Y** offers. Percent off, Amount off, Set price, Buy more save more and Free shipping ignore them. | A "first 50 orders" percent-off never stops. |
| K4 · ATS-134 | **Buy more, save more**: only the tier with "Min items" 1 is applied (per item, everywhere). Higher tiers (e.g. 20% off from 3 items) never apply, but the badge says "10–20% off". If the first tier starts at 2+, nothing is discounted at all, only a label. | Badge promises more than the bag gives. |
| K5 · ATS-135 | **Spend X, get…** (order discount) is a label only: product cards show its title, but the bag, checkout and order never take money off. | Shoppers see an offer they never get. |
| K6 · ATS-136 | **Free shipping offers also apply to orders shipped abroad** (no Egypt-only setting). | International shipping can become free. |
| K7 · ATS-141 | The form says Buy X get Y and Free shipping "show as a label until checkout is live", but both **really apply** now. | Outdated hint in the admin. |
| K8 · ATS-139 | Percent off / Amount off / Set price: if the offer is **created, changed, paused or ends in the minute before Place Order**, the server can charge a different price than the bag showed, without warning (only Buy X get Y has a "prices changed" check). | Shopper can be charged more than shown. |
| K9 · ATS-137 | A **Percent off** (or any per-item offer) **and a Buy X get Y** on the same product both apply: the free/discounted piece is worked out from the already-discounted price. | Might be more discount than intended. |
| K10 · ATS-140 | A **Free gift** offer set to "Skip products already on sale" still gives gifts with on-sale products (the sale rule isn't checked for gifts). | Setting doesn't do what it says for gifts. |
| K11 · ATS-138 | The Shop **Sale** filter (`/shop?onSale=1`) only shows products with an old (compare-at) price, not products discounted by an offer. | Offer products missing from Sale. |
| K12 · not filed (works as intended) | Offers for **signed-in shoppers only** never show on Shop/search cards (cards are priced for visitors) and appear on the product page only after it loads in the browser. | Expected, but worth confirming it looks OK. |
| K13 · ATS-142 | Buy X get Y: typing **0** in "Get discount %" turns it into **100 (free)** instead of showing an error. | Staff could give items away by mistake. |

---

## A. Create, edit and save (offer form)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Create a basic offer | New Offer → name "QA 10%", title "10% off", Percent off 10, Active on | Save Offer | "Offer saved.", back on the list, row shows Live, "10% off", "All products (n)" | Admin | |
| A2 | Empty internal name | Leave name empty | Look at preview, try Save | Error "Give this offer an internal name between 1 and 80 characters."; Save Offer is disabled | Admin | |
| A3 | Empty customer title | Leave title empty | Try Save | Error about the title (1–60 characters); Save disabled | Admin | |
| A4 | Name/title only spaces | Type "   " | Try Save | Same errors as A2/A3 (spaces don't count) | Admin | |
| A5 | Long name/title/badge | Paste 100 / 70 / 30 characters | Look at the fields | Inputs stop at 80 / 60 / 24 characters | Admin | |
| A6 | Badge override | Badge "Black Friday" | Save, open a matching product | Card and product page show "Black Friday" instead of "10% off" | Shop | |
| A7 | Badge promises more than the offer | Percent off 10, badge "50% OFF" | Look at Heads-up | Warning "The badge mentions 50%, while the rule gives 10%." (save still allowed) | Admin | |
| A8 | No product rules | No condition groups | Look at Heads-up | Warning "No product filters are set, so this offer applies to every product in the store." | Admin | |
| A9 | Rules that match nothing | Rule: Price min 999999 | Look at Heads-up | Warning "No current products match these rules yet." | Admin | |
| A10 | Save while not Active | Active off | Save | Row shows **Paused**; shop shows no discount | Admin, Shop | |
| A11 | Edit an existing offer | Open A1 → change 10 to 15 | Save | List shows 15% off; shop updates to 15% within seconds | Admin, Shop | |
| A12 | Change deal type on a saved offer | Open a Free gift offer → switch to Percent off 10 → Save → reopen | Reopen the offer | Form shows Percent off 10 only, no gift section; shop shows 10% off and no Gift Box | Admin, Shop | |
| A13 | Switch type back and forth before saving | Percent off → Buy X get Y → Free gift → Percent off | Look at values | Each switch resets to that type's defaults (10%, Buy 2 get 1 free, one empty gift…) | Admin | |
| A14 | Cancel | Change things → Cancel | Reopen | Nothing changed | Admin | |
| A15 | Double-click Save | Click Save twice quickly | — | Only one offer created (check the list for duplicates) | Admin | |
| A16 | Priority out of range | Type 500, then -500 | Save, reopen | Saved as 100 / -100 | Admin | |
| A17 | Live preview "View as" | Signed-in only offer, preview as Visitor / Signed-in / With coupon code | Switch the dropdown | Visitor: no offer price; Signed-in: offer price | Admin | |
| A18 | Live preview "At (Cairo)" | Offer starting tomorrow | Set "At" to today, then tomorrow | Offer price shows only for tomorrow | Admin | |
| A19 | Overlap warning | Another live offer covers some of the same products | Look at Heads-up | "n products are also in "<other>". Shoppers get whichever is cheaper." | Admin | |
| A20 | Saving fails | Turn off Wi-Fi → Save | — | "We couldn't save this offer. Please try again."; spinner stops, form keeps your values | Admin | |
| A21 | Non-admin can't open | Signed in as Shopper A, open `/admin/offers` | — | Sent home with "This account can't manage the store." | Shop | |
| A22 | Audit log | Create, edit, delete an offer | Check `auditLogs` in Firestore console | One entry per change (`offer.create`, `offer.update`, `offer.delete`) | Firestore | |

## B. Offer list and row actions

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Pause | Live offer → ⋮ → Pause | Open a matching product | "Offer paused."; status Paused; discount gone from product page, bag and checkout within seconds | Admin, Shop, Bag | |
| B2 | Resume | Paused offer → ⋮ → Resume | — | "Offer resumed."; Live again (if inside its dates); discount back | Admin, Shop | |
| B3 | Archive a live offer | ⋮ → Archive | — | "Offer archived."; moves to Archived tab; also switched off; discount gone | Admin, Shop | |
| B4 | Restore | Archived tab → ⋮ → Restore | — | "Offer restored."; back in All as **Paused** (not live until you Resume) | Admin | |
| B5 | Delete permanently | Archived offer → ⋮ → Delete Permanently → Delete | — | Confirm dialog, then "Offer deleted."; gone everywhere | Admin | |
| B6 | Delete — cancel | Same, press Cancel in the dialog | — | Nothing deleted | Admin | |
| B7 | Delete only for archived | Live offer → ⋮ | — | No "Delete Permanently" option | Admin | |
| B8 | Duplicate | ⋮ → Duplicate | — | "Offer duplicated as paused."; new row "<name> (copy)", Paused, same reward and rules, **no coupon code** | Admin | |
| B9 | Duplicate a long name | Name of 80 characters → Duplicate | — | Copy name cut to 80 characters | Admin | |
| B10 | Tabs | Have one Live, Scheduled, Ended, Paused, Archived | Click each tab | Live/Scheduled/Ended show only those; Paused shows only in **All**; Archived only in Archived | Admin | |
| B11 | Columns | — | Look at a row | Status, title + internal name (+ code), reward text, matches count ("All products (n)" / "n products" / "n (m partly)"), Cairo dates "Starts now → No end date", priority | Admin | |
| B12 | Sort | Click Status / Offer / Priority headers | — | Rows sort | Admin | |
| B13 | Pause an ended offer | Ended offer → Pause → Resume | — | Shows Paused, then Ended again (dates still rule) | Admin | |
| B14 | Pause a free gift offer while a shopper has a gift in the bag | Shopper has a bag item with a gift → admin pauses | Shopper opens checkout and places order | Gift not given (or the shopper is asked to fix the bag); the order is never refused forever | Bag, Order | |

## C. Timing and schedule (Cairo time)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | No dates | Start and end empty | — | "Starts immediately when active." / "Runs until you pause or archive it."; Live | Admin | |
| C2 | Starts Now button | Click Starts Now | Save | Start = current Cairo time; Live | Admin | |
| C3 | No End Date button | Set an end, then click No End Date | — | End cleared | Admin | |
| C4 | Future start | Start = now + 10 min | Save, watch the shop | Status **Scheduled**; no discount until the start time; at the start time product page/bag show it within ~1 minute, cards/search within ~15 minutes; then status Live | Admin, Shop | |
| C5 | Future end | End = now + 10 min | Wait | At the end time discount stops (product page/bag within ~1 min, cards within ~15 min); status **Ended** | Admin, Shop | |
| C6 | End before start | Start tomorrow, end today | Try Save | Error "The end time must be after the start time."; Save disabled | Admin | |
| C7 | End equal to start | Same date and time | Try Save | Same error | Admin | |
| C8 | Start in the past | Start = yesterday | Look at Heads-up | Warning "The start time is in the past, so this offer starts as soon as it is active." | Admin | |
| C9 | Ends within 1 hour | End = now + 30 min | Look at Heads-up | Warning "This offer ends in less than 1 hour." | Admin | |
| C10 | End already passed | End = yesterday, Active | Save | Status Ended; no discount anywhere | Admin, Shop | |
| C11 | Times are Cairo, not your laptop | Change your computer's time zone to London, set start 20:00 | Save, reopen, check list | Still shows 20:00 Cairo; offer starts at 20:00 Cairo | Admin | |
| C12 | Summer time (Egypt DST) | Start on a date between May and Oct (e.g. 1 Jul 12:00) and one in winter (1 Dec 12:00) | Save, reopen | Both show exactly 12:00 again (no 1-hour shift) | Admin | |
| C13 | Midnight edges | Start 00:00, end 23:59 same day | Save | Live only during that day in Cairo | Admin, Shop | |
| C14 | Offer ends while shopper is in the bag | Percent off ending in 2 min; shopper keeps bag open | Wait past end | Bag and checkout prices go back to normal within ~1 min without reloading | Bag, Checkout | |
| C15 | Buy X get Y ends during checkout | BXGY ending in 2 min; shopper on checkout with the deal | Place Order just after the end | Refused: "The <title> offer has ended, so this order's total changed. Check your bag and place your order again."; offer then disappears from bag/checkout; second Place Order works at the new total | Checkout, Order | |
| C16 | Percent off ends during checkout ⚠ Gap K8 | Percent off ending in 2 min | Place Order a few seconds after the end, before the page updates | Note what happens: order may be charged full price with no warning. Compare confirmation total with what checkout showed | Order | |
| C17 | Scheduled + paused | Future start, Active off | — | Status Paused (not Scheduled); never starts until resumed | Admin | |
| C18 | Shopper's computer clock is wrong | Set phone clock 1 hour ahead; offer ends in 30 min | Open product page | Note: the browser uses the phone clock, the server uses real time; the order total must follow the server (BXGY refuses, see C15) | Shop, Order | |

## D. Who gets it (audience and coupon code)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Everyone | Who can get this offer: Everyone | Visit signed out and signed in | Both see the discount | Shop, Bag | |
| D2 | Signed-in only, visitor | Signed-in shoppers only | Open product signed out | No discount on product page or bag; no badge on cards/search | Shop, Bag | |
| D3 | Signed-in only, shopper | Same | Sign in, open the same product | Discount on product page, bag and checkout; charged in the order | Shop, Bag, Order | |
| D4 | Sign out with a discounted bag | Same, Shopper A signed in with item in bag | Sign out | Bag empties (normal sign-out) and discount no longer shows anywhere | Bag | |
| D5 | Signed-in only on cards ⚠ K12 | Same | Look at Shop/search cards while signed in | Note: cards likely show the full price (cards are priced for visitors); product page shows the discount | Shop | |
| D6 | Coupon code field | Tick "Requires a coupon code", type "qa10" | — | Field turns it into "QA10" | Admin | |
| D7 | Code ticked but empty | Tick, leave empty | Try Save | Error "Enter a coupon code or turn off "Requires a coupon code"." | Admin | |
| D8 | Duplicate code | Another non-archived offer uses QA10 | Type QA10 | Error "Code "QA10" is already used by "<name>"." | Admin | |
| D9 | Same code as an archived offer | Only an archived offer uses QA10 | Type QA10 | Allowed | Admin | |
| D10 | Code offer on the shop ⚠ Gap K1 | Code offer QA10 live | Look for any place to enter it; open product, bag, checkout | Today: no code box anywhere and no discount. Confirm, then decide if codes should be built or the option hidden | Shop, Checkout | |
| D11 | Turn code off | Untick on a saved code offer | Save | Offer becomes public; list no longer shows "Code:" | Admin | |
| D12 | Code shown in list | Code offer | — | Row shows "· Code: QA10" under the name | Admin | |

## E. Which products (conditions and "Except")

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Brand | Rule: Brand is one of [P1's brand] | — | P1 discounted, P4 not | Shop | |
| E2 | Category (parent) | Category is one of [parent of P1, e.g. Apparel] | — | Products in its child categories also match | Shop | |
| E3 | Category (child) | Category is one of [one child] | — | Only that child's products | Shop | |
| E4 | Specific product | Specific product is one of [P1] | — | Only P1 | Shop | |
| E5 | Product type | Product type is one of [P1's type] | — | Only that type | Shop | |
| E6 | Tag | Tag is one of [a tag] | — | Only tagged products | Shop | |
| E7 | Model group | Model group is one of [P1's model] | — | Every colour of that model; products with no model group don't match | Shop | |
| E8 | Size | Size is one of [M] | Open P1 | Card/product page show "From 900"; choosing M shows 900, L shows 1,000; bag line M discounted, L not | Shop, Bag | |
| E9 | Colour on a 2-colour product | Colour is one of [black] on P5 (black+white) | — | Badge "10% off in Black", price "From"; only black is discounted | Shop, Bag | |
| E10 | Price range | Price (EGP) min 500 max 1,500 | — | P1 (1,000) matches, P3 (200) doesn't; P2 matches on its **sale** price (800), not the old price | Shop | |
| E11 | Price min > max | Min 2,000 max 500 | — | No products match; warning "No current products match…" | Admin | |
| E12 | "is not one of" | Brand is not one of [P1's brand] | — | Everything except that brand | Shop | |
| E13 | Two rules in one group (AND) | Group: Brand = X **and** Category = Y | — | Only products that are both | Shop | |
| E14 | Two groups (OR) | Group 1: Brand X; Group 2: Category Z | — | Products in either | Shop | |
| E15 | Except a product | Rules: all products; Except: P1 | — | Every product except P1 | Shop | |
| E16 | Except a colour on a 2-colour product | Except: Colour is one of [black] on P5 | — | White discounted, black not | Shop, Bag | |
| E17 | Same product included and excluded | Include P1, Except P1 | — | P1 not discounted (Except wins) | Shop | |
| E18 | Limits on rules | Add 11 groups / 11 rules in a group | Try Save | Errors "Use up to 10 condition groups." / "Each condition group can have up to 10 rules." | Admin | |
| E19 | Empty rule | Add a rule but pick no values | Save | Rule with nothing picked matches everything for that field (check the preview count before saving) | Admin | |
| E20 | Product moved category later | Offer on Category Y; move P1 out of Y in Products | — | P1 loses the discount (shop, bag, checkout) | Shop, Bag | |
| E21 | Unpublished / out-of-stock product | Offer covers P1; unpublish or zero stock | — | Normal rules: not shown / can't be bought; no errors | Shop | |

## F. Percent off

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 10% off | Percent off 10, P1 | — | Card, product page, bag, checkout: 900 with 1,000 struck through, badge "10% off"; order line 900 | Shop, Bag, Order | |
| F2 | Rounding | 15% off a 999 product | — | 849 (rounded to whole pounds), same on server order | Shop, Order | |
| F3 | 100% off | Percent off 100 | — | Price 0; order line 0 (check this is wanted) | Shop, Order | |
| F4 | Out of range | Type 0, then 150, then -5 | — | 0: error "Enter a discount percentage between 1 and 100." and Save disabled; 150 becomes 100; -5 becomes 1 | Admin | |
| F5 | High percent warning | 70 | — | Warning "This takes 70% off matching products." | Admin | |
| F6 | Quantity | P1 × 3 in bag | — | Line 2,700 | Bag, Order | |
| F7 | Abroad shopper | Visitor from outside Egypt (or `?cur=USD`) | — | Discounted price converted to their currency; order charged the EGP discounted price | Shop | |
| F8 | Uses limit ⚠ Gap K3 | Total uses 1 | Place 2 orders | Today: both get the discount and the offer stays on. Decide if this is a bug | Order | |

## G. Amount off

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | 200 off | Amount off 200, P1 | — | 800 (per item), badge "20% off" (percent worked out) | Shop, Bag, Order | |
| G2 | Amount bigger than price | Amount off 1,500 on P1 | Look at Heads-up, then shop | Warning "…becomes free"; price 0 | Admin, Shop | |
| G3 | Below 1 | Type 0, then -5 | — | 0: error "Enter a discount amount of at least EGP 1." and Save disabled; -5 becomes 1 | Admin | |
| G4 | Per item, not per order | P1 × 2 | — | 2 × 800 = 1,600 | Bag | |

## H. Set price

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Lower than price | Set price 700, P1 | — | 700, old 1,000 struck through | Shop, Bag, Order | |
| H2 | Higher than price | Set price 1,200 on P1 | Heads-up, then shop | Warning "The set price is higher than or equal to the current price for 1 product, which will be skipped"; P1 stays 1,000 | Admin, Shop | |
| H3 | Equal to price | Set price 1,000 | — | Skipped, no badge | Shop | |
| H4 | Set price 0 | 0 | — | Free (check this is wanted) | Shop | |
| H5 | On a sale product | Set price 700, P2 (800, was 1,000) | — | 700 with 1,000 struck through | Shop | |

## I. Products already on sale (P2: 800, was 1,000)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | Best discount wins, offer better | Percent off 30, "Best discount wins" | — | 30% of 1,000 = **700** (beats 800); badge 30% off | Shop, Bag, Order | |
| I2 | Best discount wins, sale better | Percent off 10, Best discount wins | — | 10% of 1,000 = 900 is worse than 800 → stays **800**, badge "20% off" (the sale) | Shop | |
| I3 | Skip sale products | Percent off 30, "Skip products already on sale" | — | P2 stays 800; P1 gets 700 | Shop | |
| I4 | On top of sale | Percent off 20, "Apply on top" | Heads-up, then shop | Warning "Products already on sale get this discount on top of their sale price."; P2 = 640 | Admin, Shop | |
| I5 | Explanation text | Switch the three options | — | Example text under the dropdown changes each time | Admin | |
| I6 | Sale filter ⚠ K11 | Percent off on P1 | Open `/shop?onSale=1` | Today P1 isn't listed (only compare-at sales are). Decide | Shop | |
| I7 | Buy X get Y + skip sale | BXGY, Skip sale products, bag P2 × 3 | — | No free piece (sale items left out) | Bag | |
| I8 | Free gift + skip sale ⚠ K10 | Free gift on P2, Skip sale products | Open P2 | Today the Gift Box still shows. Decide | Shop | |

## J. Buy X get Y

Default after choosing the type: Buy 2, Get 1, 100% (free), "The cheapest of them", repeat on.

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| J1 | Buy 2 get 1 free, same items | BXGY on P1 | Bag P1 × 3 | One piece free: line 2,000, old 3,000 struck, tag "1 free"; checkout and order 2,000 | Bag, Checkout, Order | |
| J2 | Not enough pieces | Same | Bag P1 × 2 | No discount; nudge "Add 1 more to get 1 free" with **Add 1** button | Bag | |
| J3 | Add 1 button | Same | Press Add 1 | Quantity becomes 3 and one piece is free | Bag | |
| J4 | Only 1 piece | Same | Bag P1 × 1 | No discount and no nudge (the bought part is short too) | Bag | |
| J5 | Repeat on | Repeat on | Bag P1 × 6 | 2 free (2 groups of 3) | Bag | |
| J6 | Repeat off | Repeat off | Bag P1 × 6 | Only 1 free | Bag | |
| J7 | Max times per order | Repeat on, Max 2 | Bag P1 × 9 | Only 2 free | Bag | |
| J8 | Cheapest is free | Offer on P1 and P3 (same category) | Bag P1 × 2 + P3 × 1 | P3 (200) is the free one; tag "Free" on P3 | Bag, Order | |
| J9 | Mixed prices, 2 groups | Same, repeat on | Bag P1 × 4 + P3 × 2 | The two P3 are free | Bag | |
| J10 | 50% instead of free | Get discount 50 | Bag P1 × 3 | "1 at −50%", line 2,500 | Bag, Order | |
| J11 | Buy 1 get 1 | Buy 1 Get 1 | Bag P1 × 2 | One free | Bag | |
| J12 | Get 2 | Buy 3 Get 2 | Bag P1 × 5 | Two free; with 4 in bag nudge "Add 1 more to get 2 free" | Bag | |
| J13 | Free item = specific products | "One of these products": P3; offer conditions: P1 | Bag P1 × 2 | Strip with P3 photo tile(s) to pick from; tapping adds P3 to the bag and it is free | Bag | |
| J14 | Free item list empty | "One of these products", none added | Try Save | Error "Pick at least one product that can be the free item." | Admin | |
| J15 | Free item = category/brand | "Any item from a category or brand": category of P3 | Bag P1 × 2 + P3 × 1 | P3 free | Bag | |
| J16 | Category/brand empty | Choose that mode, pick nothing | Try Save | Error "Pick at least one category or brand for the free item." | Admin | |
| J17 | Free item more expensive than bought | Free item: P1 (1,000); buy items: P3 (200) | Bag P3 × 2 + P1 × 1 | P1 free (check the business wants this) | Bag | |
| J18 | Free item rule reopens correctly | Save J13, reopen | — | Mode "One of these products" with P3 listed | Admin | |
| J19 | Product deleted from free list | Free item P3, then P3 unpublished | Open editor; bag P1 × 2 | Editor shows "Product not found" or the name; bag shows no tile for it | Admin, Bag | |
| J20 | Two sizes of the same product | BXGY on P1 | Bag P1 M × 2 + P1 L × 1 | One piece free (sizes count together) | Bag | |
| J21 | Gift vs free piece | P1 also has a Free gift (worth G1 price) | Bag P1 × 3 with gifts picked | Each piece gets either the gift or the discount, whichever is worth more; free piece shows no gift | Bag, Order | |
| J22 | Product page line | BXGY on P1 | Open P1 | One line under the price with the offer title (not a price badge); price not reduced | Shop | |
| J23 | Server agrees | J1 bag | Place order | Order line has the discount, admin Orders shows "Offer · Free", email shows the tag and lower line price | Order, Admin | |
| J24 | Offer paused between bag and order | J1 bag; admin pauses the offer | Place Order before the page updates | Refused with "The … offer has ended…" or "Prices in your bag changed…"; never charged more than shown; second try works | Order | |
| J25 | Offer created after bag loaded | Bag P1 × 3 shows discount from a brand-new offer | Place Order within 60 seconds | Order still gets the discount (server re-reads offers) | Order | |
| J26 | Validation | Buy 0, Get 0, Get % 150, Max times 0 | — | Buy and Get become 1; Get % becomes 100; Max times 0 or empty = no limit | Admin | |
| J26b | Get % typed as 0 ⚠ | Type 0 in "Get discount %" | — | Today it silently becomes **100 (free)**, not an error. Probably a bug: should be an error or 1 | Admin | |
| J27 | Order discount + Percent off ⚠ K9 | Percent off 10 + BXGY on P1 | Bag P1 × 3 | Today: each 900, one free → 1,800. Decide if both should apply | Bag, Order | |

## K. Buy more, save more (tiered)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| K1t | Default tiers | Tiers 1 → 10%, 3 → 20% on P1 | Open P1, bag P1 × 1 and × 3 | Today: every piece 900 (10%) even with 3; badge "10–20% off" ⚠ Gap K4 | Shop, Bag, Order | |
| K2t | First tier starts at 2 | Tiers 2 → 10%, 4 → 20% | Bag P1 × 4 | Today: no discount at all, only the label ⚠ Gap K4 | Shop, Bag | |
| K3t | Tiers out of order | 3 then 1 | Try Save | Error "Tier minimums must go up in order (for example 1, then 3)." | Admin | |
| K4t | Same minimum twice | 2 and 2 | Try Save | Same error | Admin | |
| K5t | Add/remove tiers | Add up to 5, remove down to 2 | — | Add Tier hidden at 5, Remove hidden at 2 | Admin | |
| K6t | Tier percent | Type 0, then 150 | — | 0: error "Each tier percentage must be between 1 and 100."; 150 becomes 100 | Admin | |
| K7t | Tier min 0 | First tier Min items 0 | — | Error "Tier minimums must go up in order…" | Admin | |

## L. Free gift

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | One gift, several choices | Gift "Free shirt": G1 + another shirt; offer on P1 | Open P1 | Gift Box: black header with the gift name, a row of shirt cards, then a size step for G1 | Shop | |
| L2 | Two gifts | Gift 1 "Free shirt" (G1), Gift 2 "Free socks" (G2) | Open P1 | Two numbered steps; header "Free shirt and socks…" | Shop | |
| L3 | Add to Bag without choosing | L2 | Press Add to Bag with a step open | Nothing added; first open step highlighted with "Choose your free shirt first." and focused | Shop | |
| L4 | Pick and add | L2 | Pick shirt + size + socks, Add to Bag | Bag shows P1, then "Free shirt: <name>, <size> · Free" and "Free socks: <name> · Free" | Bag | |
| L5 | One choice, no sizes | Gift with only G2 | Open P1 | G2 picked for the shopper automatically | Shop | |
| L6 | Quantity 2 | L4, set P1 quantity 2 | Place order | Order has 2 of each gift at 0; gifts add weight to shipping, not to subtotal | Checkout, Order | |
| L7 | Different picks = different lines | Add P1 with shirt A, then P1 with shirt B | — | Two separate bag lines | Bag | |
| L8 | Gift sold out | G3 as the only choice; set G3 stock 0 | Open P1 | Gift Box hides that gift (no Gift Box if no gift is left) | Shop | |
| L9 | Gift sold out after adding | Bag has P1 + G3; then G3 stock 0 | Place Order | Refused with a clear message or gift not given — never an endless failure | Order | |
| L10 | Gift unpublished | Unpublish G1 | Open P1 | G1 not offered | Shop | |
| L11 | Gift with an extra choice (not size) | Gift product with a colour/"choose" option | Open P1 | That product can't be given (not offered) | Shop | |
| L12 | Stock on confirm | Place COD order with gifts; admin Confirm Order | Check G1 stock | Gift stock goes down with the order | Admin | |
| L13 | Validation: no gifts | Remove all choices | Try Save | "Choose at least one product shoppers can pick for "<gift>"." | Admin | |
| L14 | Validation: gift name | Empty name / 41+ characters | Try Save | "Give each gift a short name between 1 and 40 characters…" (input stops at 40) | Admin | |
| L15 | Max 5 gifts, 20 choices | Add gifts / choices | — | Add Gift hidden at 5; add-product dropdown hidden at 20 | Admin | |
| L16 | Gift offer is always per item | Choose Free gift | Save, check Firestore | `scope: 'item'`, `minimum: null` | Firestore | |
| L17 | Two gift offers on one product | Offer A priority 10, Offer B priority 0 | Open P1 | Only Offer A's Gift Box; if all A's gifts sold out, B's shows | Shop | |
| L18 | No badge for gifts | L1 | Look at card | No price badge for the gift offer | Shop | |
| L19 | Confirmation, emails, admin | L4 order | Open confirmation page, email, admin Orders | Each gift under its item marked "Free" | Order, Admin | |
| L20 | Old cart-wide gift offer | An old gift offer with a minimum spend (if any exists) | Open it, Save | After saving it gives gifts per item | Admin, Shop | |
| L21 | Guest bag | Signed out: add P1 + gifts, then sign in | — | Gifts kept on the merged account bag | Bag | |

## M. Free shipping

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | No minimum | Free shipping, minimum empty, all products | Checkout Egypt | Shipping "Free" in checkout and order | Checkout, Order | |
| M2 | Minimum 3,000, under | Minimum 3,000 | Subtotal 2,999 | Normal shipping fee | Checkout | |
| M3 | Minimum 3,000, exactly | Same | Subtotal 3,000 | Free | Checkout, Order | |
| M4 | Minimum after discounts | Minimum 3,000 + BXGY | Bag 3,000 before deal, 2,000 after | Not free (minimum uses the subtotal after offers) | Checkout | |
| M5 | Only some products | Conditions: Brand X | Bag with one Brand X item + others | Free (one matching item is enough) | Checkout | |
| M6 | No matching product | Same | Bag without Brand X | Normal fee | Checkout | |
| M7 | Abroad ⚠ Gap K6 | M1 | Checkout with an address outside Egypt (if Card or Wallet is live) | Today: shipping becomes free abroad too. Decide | Checkout | |
| M8 | Large order (fee to be agreed) | M1 | Bag heavier than the biggest Egypt box | Still "delivery fee to be agreed"; free shipping does not apply | Checkout, Order | |
| M9 | Cash on Delivery deposit | M1 + COD | Checkout | No "Send the delivery fee" step (fee is 0) | Checkout | |
| M10 | Product page line | M1 | Open product | One line under the price with the offer title | Shop | |
| M11 | Shipping settings promo also on | Settings → Shipping promo or free-over also active | Checkout | The cheapest fee wins (0) | Checkout | |
| M12 | Bag | M1 | Open bag | Bag still says "Shipping is worked out at checkout." | Bag | |
| M13 | Admin hint ⚠ K7 | Choose Free shipping | — | Hint says "Shows as a label until checkout is live" even though it works. Copy fix | Admin | |

## N. Spend X, get… (order discount)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | Amount off order | Spend 4,000, Amount off 300 | Bag 4,000+ | Today: no discount in bag, checkout or order; cards show the title as a badge ⚠ Gap K5 | Shop, Bag, Order | |
| N2 | Percent off order | Spend 4,000, Percent off 10 | Same | Same as N1 | Bag | |
| N3 | Switch reward type | Amount ↔ Percent | — | Fields swap | Admin | |
| N4 | Reopen | Save N1, reopen | — | Shows "Spend X, get…" with 4,000 and 300 | Admin | |
| N5 | "Exclusive" setting ⚠ K2 | Spend X offer + a Percent off marked Exclusive | — | No difference today | Bag | |

## O. Two or more offers at once

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| O1 | Cheaper one wins | Offer A 10% and Offer B 20% on P1 | Open P1 | 800, badge from B; never both | Shop, Bag, Order | |
| O2 | Same price, priority decides | A and B both 10%, A priority 10 | Open P1 | A's badge/title shown | Shop | |
| O3 | Same price, same priority | Both 10%, priority 0 | — | The one edited most recently wins | Shop | |
| O4 | Percent vs amount | A 10% (900), B 200 off (800) | — | 800 (B) | Shop | |
| O5 | Percent vs set price | A 10% (900), B Set price 950 | — | 900 (A) | Shop | |
| O6 | One is signed-in only | A everyone 10%, B signed-in 20% | Visitor vs Shopper | Visitor 900; Shopper 800 | Shop | |
| O7 | Higher-priority one is paused | A 20% paused, B 10% live | — | 900 | Shop | |
| O8 | Different sizes, different offers | A 10% on size M, B 20% on size L | Bag P1 M and P1 L | M 900, L 800; card "From 800" | Bag | |
| O9 | Two Buy X get Y on same items | A Buy 2 get 1 (priority 10), B Buy 1 get 1 50% | Bag P1 × 3 | A applies first (1 free); remaining pieces not used twice | Bag, Order | |
| O10 | Buy X get Y + Free gift | See J21 | | | | |
| O11 | Percent off + Free gift | 10% and gift on P1 | Open P1 | 900 and the Gift Box both show; order: 900 + gifts at 0 | Shop, Order | |
| O12 | Percent off + Free shipping | 10% on P1 + free shipping min 3,000 | Bag P1 × 3 (2,700) | Not free (2,700 < 3,000) | Checkout | |
| O13 | Up to 3 badges | Percent off + BXGY + free shipping on P1 | Open card | At most 3 badges, no repeats | Shop | |
| O14 | Overlap warning in the form | B covers some of A's products | Open B | Heads-up overlap line naming A | Admin | |

## P. Use limits (Free gift and Buy X get Y only)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Uses per customer 1 (BXGY) | BXGY, Uses per customer 1 | Shopper A orders with the deal, then tries again | Second order refused: "You've already used the <title> offer, …"; offer then disappears for A; A can order at full price; Shopper B still gets it | Order | |
| P2 | Total uses 2 (BXGY) | Total uses 2 | A orders, B orders | After the 2nd order the offer is switched off automatically (Paused, `updatedBy: system:offer-limit`) | Order, Admin | |
| P3 | Total uses reached during checkout | Total 1; A and B both on checkout | Both place order | First wins; second refused with "The <title> offer has ended…", then can order at the new total | Order | |
| P4 | Gift offer per customer | Free gift, per customer 1 | A orders with gift, then again | Second time refused or no gift (clear message) | Order | |
| P5 | One use per order | Per customer 1; order has 3 groups / 3 gifts | — | Counts as 1 use | Order | |
| P6 | Cancelled order keeps the use | P1, admin cancels A's first order | A tries again | Still refused (uses aren't given back) | Order | |
| P7 | Paymob payment fails | Card or Wallet live, total 1 | Start a Paymob payment that fails to start | Offer switched back on, use given back | Order | |
| P8 | Staff paused it already | Total 1, admin pauses before the last order | — | Offer stays paused after (not switched back on) | Admin | |
| P9 | Limit fields | Type 0 / -1 / empty | — | Saved as Unlimited | Admin | |
| P10 | Limits on other types ⚠ K3 | Percent off, Total uses 1 | 2 orders | Today: not limited | Order | |

## Q. Where offer prices show (consistency)

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | Same price everywhere | Percent off 10 on P1 | Compare home row, Shop, category, brand, search, favourites, product page, bag, checkout, confirmation, email, admin Orders | All show 900 (cards may take a moment) | All | |
| Q2 | Sort by price | Percent off 50 on an expensive product | Shop → sort price low to high | Product sorted by its offer price (after the 15-minute refresh at most) | Shop | |
| Q3 | Search records refresh after edit | Change 10% → 30% | Wait ~1 min, reload Shop | Cards show 30% | Shop | |
| Q4 | Product page first load | Percent off on P1 | Open P1 directly (reload) | Discount visible in the first paint (server-rendered), no flicker from 1,000 to 900 | Shop | |
| Q5 | Abroad visitor | `?cur=USD` | Open P1 and bag | Converted discounted price | Shop | |
| Q6 | Offer badge on home New Arrivals | P1 is a new arrival | Home | Badge and price shown on the card | Shop | |
| Q7 | Phone and desktop | Any offer | Check product page, bag and checkout on phone and desktop | Badges, struck prices, deal tags and Gift Box fit and are readable | Shop, Bag | |
| Q8 | Offer deleted while shopper browses | Delete an archived offer | — | No errors anywhere | Shop | |
| Q9 | Many offers | 20+ live offers | Open Shop and a product | Page still loads normally | Shop | |

## R. Live changes while a shopper is mid-purchase

| # | Scenario | Admin setup | Steps | Expected | Check in | Result |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Offer raised during checkout | 10% → 20% while shopper is on checkout | Watch checkout | Summary updates to 20% within seconds; order charged 20% (if placed after ~1 min) | Checkout, Order | |
| R2 | New offer, order within 60s ⚠ K8 | Create 20% on P1 while shopper is on checkout | Place order right away | Note the charged total vs the shown one | Order | |
| R3 | Offer paused, order within 60s ⚠ K8 | Pause a 20% offer | Place order right away | Note the charged total vs the shown one | Order | |
| R4 | Offer paused, BXGY | See J24 | | | | |
| R5 | Product price changed | Change P1 price 1,000 → 1,200 with 10% offer | Bag | 1,080 | Bag, Order | |
| R6 | Two tabs | Bag open in two tabs, offer changes | — | Both tabs update | Bag | |
