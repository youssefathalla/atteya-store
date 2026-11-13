---
name: returns-and-exchanges
description: Returns & Exchanges for shoppers and staff - who can send a request and when, the kinds (Different Size, Different Colour, Return It, Damaged Item, Wrong Item Sent), statuses, the free gift rule, refund and courier fee math, the stock plan per kind, the requestReturn and cancelReturnRequest callables, returnRequests and the order's returns summary, and the return emails. Read it before changing any of these.
---

# Returns & Exchanges

Built in four tickets: <KEY>-291 (server, shared rules, first emails), <KEY>-292 (shopper screen), <KEY>-293 (admin Returns page and stock moves), <KEY>-294 (later emails and the Terms page).

**How to edit this file:** one fact per line, as a list item under the heading it belongs to. Add a new rule as its own line, or a new `##` heading for a new topic. Never join rules into one long paragraph: Git merges line by line, so two PRs that touch the same long line conflict even when they change different sentences.

## Where the rules live

- Every rule is in `functions/src/store/returns.ts` (pure, no Firestore). Edit only that file, then run `npm run sync:engine`, which copies it to `src/app/core/config/returns.ts` for the website.
- The callable input check and the request builder are in `functions/src/returns/return-request.ts` (`parseRequestReturn()`, `buildReturnRequest()`), pure and unit tested.
- Tests: `functions/src/returns/returns.test.ts` (in `npm test --prefix functions`) covers every row of the stock table, the window, gifts, money, refusals and both emails.
- Returns are recorded next to the order, never by changing `pricing.lines` or any order total.

## Who and when

- Only **Delivered** orders, until 14 days after `deliveredAt` (`RETURN_WINDOW_DAYS`, `returnEligibility(order, nowMs)`).
- Orders with no `deliveredAt` and orders shipped outside Egypt (`pricing.isInternational`) are refused with "Please message us on WhatsApp about a return or exchange for this order."
- One open request per order at a time: Requested, Approved, or Received while a refund is still to send (`isOpenReturn()`).
- A piece already in a request that isn't Rejected or Cancelled can't be asked for again (`piecesLeft()`).
- At most 10 requests per order, cancelled and rejected ones included (`RETURN_REQUESTS_PER_ORDER_MAX`), so a cancel and resend loop can't flood the staff inbox.
- The signed-in owner is matched by uid (`customerId`); a guest by the order's secret `viewKey` from the emailed order link (`isOrderShopper()` in `functions/src/returns/return-access.ts`, constant-time compare).
- Every refusal has a plain message (`returnRefusalMessage()` and `ReturnRequestError` in `return-request.ts`, turned into an `HttpsError` by the callable).

## Kinds

- Kinds are chosen per item, with pieces and quantity per item: `different-size` (Different Size), `different-colour` (Different Colour), `return` (Return It), `damaged` (Damaged Item), `wrong-item` (Wrong Item Sent).
- Different Size: same product (still there and not hidden), a size id from the product's `size` option that differs from the one bought.
- Different Colour: another product with the same non-empty `modelGroup`, not hidden (`published !== false`), with the same `price` as the product bought; a different price is refused with "Different price, message us on WhatsApp."; a size is required when the colour has sizes.
- Return It needs a reason: `didnt-fit` (Didn't fit), `not-as-pictured` (Not as pictured), `changed-mind` (Changed my mind), `other` (Other).
- Damaged Item wants `send-another` (Send Another) or `refund` (Refund); Wrong Item Sent wants `send-right-one` (Send the Right One) or `refund` (Refund).
- An optional note per request, at most 500 characters (`RETURN_NOTE_MAX`); `refundTo` (InstaPay number or address, at most 100 characters) is required when any item is a refund.
- Each saved item carries `askedLabel` for emails and the admin: `Size M → L`, `Black → White · Size L`, `Return · Didn't fit`, `Damaged · Send Another`, `Wrong Item · Refund`.
- Exchanging for a different product is not a kind: shoppers pick Return It with Other and explain, staff handle it on WhatsApp.
- No photo upload on the website: shoppers send photos on WhatsApp.

## Statuses

- `requested` → `approved` → `received`; a request with any refund item goes on to `refund-sent` (`nextReturnStatuses()`).
- `rejected` (with a reason shown to the shopper) is possible any time before Received; `cancelled` (by the shopper) only while Requested.
- Names (`returnStatusLabel()`): Requested, Approved, Received, Refund Sent, Rejected, Cancelled. The shopper sees the same names as staff.
- Request ref: `#R-` + the first 6 characters of the request id in capitals (`returnRef()`), like the order ref.

## Free gifts

- Gifts (`pricing.lines[].gift.forLine`) stay with the shopper on any exchange.
- On a refund, the line's gifts come back too: over all the order's requests, floor(refunded pieces × gift pieces ÷ line pieces), and all of them once every piece of the line is refunded; a request sends back only what that adds now (`giftsBack()`, which reads earlier refunds and returned gifts from the order's `returns`).
- Returned gifts are added to the request automatically (`autoGift: true`, `forLine`); exchanged pieces never bring a gift back.
- A gift line can be exchanged for size or colour, never returned alone for money.

## Money

- Refund per piece = what was paid after offers: `lineDisplay ÷ quantity` (whole EGP), the whole line exactly (`refundEgpFor()`); older lines use `fullEgp − discountEgp`, else `unitEgp × quantity`.
- Partial refunds are rounded on the running total of the line's refunded pieces, so every refund of one line together is exactly what was paid.
- Buy X Get Y and bundle discounts are not taken back on a partial return: the refund is the line's own `lineDisplay` share (the brief's rule).
- Courier fee = the order's own delivery fee (`pricing.shipping.priceEgp`, the agreed fee for `domestic-agreed`); when it was 0 (free shipping) the order box's normal price in `settings/shipping` (`normalBoxFeeEgp()` in `functions/src/store/returns.ts`, the biggest Egypt box when the order has none) (`courierFeeEgp()`).
- The fee is 0 when any item is Damaged or Wrong Item Sent (the store pays, `storeFault`).
- Otherwise the fee is taken off the refund when there is one (`off-refund`), or paid in cash to the courier for an exchange-only request (`cash`) (`returnMoney()`); a refund smaller than the fee leaves the rest as `cashAtDoorEgp`.
- The original delivery fee is never refunded.
- Refunds are sent by InstaPay after the items are Received; Paymob automatic refunds are not built.

## Stock plan

- `returnStockPlan(items)` turns a request into `approve` and `received` steps of `take` / `putBack` pieces (`{ productId, selection, quantity }`); `applyStockMoves()` applies them (see Staff steps).
- Different Size / Different Colour: new piece −1 at Approve; returned piece +1 at Received if it can be sold again.
- Return It: nothing at Approve; piece +1 at Received if it can be sold again.
- Damaged · Send Another: the same piece −1 at Approve; nothing back by default (`canBeSoldAgain` defaults off for Damaged).
- Damaged · Refund: nothing at Approve; nothing at Received by default.
- Wrong Item Sent · Send the Right One: the piece actually sent −1 at Approve (the ordered piece +1 then −1 = no change); the sent piece +1 at Received.
- Wrong Item Sent · Refund: the sent piece −1 and the ordered piece +1 at Approve; the sent piece +1 at Received.
- For wrong items staff choose the piece actually sent at Approve (`sentPiece`); until then the item is listed in `missing`.
- Rejecting or cancelling after Approve undoes the Approve moves (`undoStockStep()`).

## Data

- `requestReturn` reads `settings/shipping` only when the order's delivery fee was 0.
- `requestReturn` (`functions/src/returns/request-return.fn.ts`, `europe-west3`, App Check like every callable) takes `{ orderId, viewKey?, items[], note?, refundTo? }`; each item is `{ lineIndex, quantity, kind, reason?, wants?, size?, colourProductId? }`; it answers `{ requestId, ref }`.
- In one transaction it creates `returnRequests/{id}` and appends to the order's `returns` array `{ id, ref, status, hasRefund, storeFault, refundEgp, items: [{ lineIndex, quantity, refund, autoGift, askedLabel }], createdAt }` (built by `returnSummaryEntry()`; `createdAt` is a Timestamp from the function's clock, because arrays can't hold server time stamps).
- The summary carries only what the shopper's request box shows (<KEY>-296): `askedLabel` is the same text as `returnRequests/{id}.items[].askedLabel`, `refundEgp` is the refund after the courier fee; never `refundTo`, the note, the customer, the staff history or staff notes, because shoppers and guests (`orderViews`) read it.
- Entries written before <KEY>-296 have no `storeFault`, `refundEgp` or `askedLabel`; `readReturnSummaries()` leaves these out, the website reads them with `readRequestDetails()`.
- `returnRequests/{id}` holds `ref`, `orderId`, `orderRef`, `status`, `customerId`, `guest`, `customerEmail`, `customer` (name, phone, email, country, address), `items` (line, kind, reason, wants, refund, gift, autoGift, forLine, product, selection, name, photo, new piece, `askedLabel`, `refundEgp`), `note`, `refundTo`, `hasRefund`, `storeFault`, `itemsEgp`, `feeEgp`, `feePaid`, `refundEgp`, `cashAtDoorEgp`, `orderDeliveredAt`, `createdAt`, `updatedAt`.
- `cancelReturnRequest` (`functions/src/returns/cancel-return-request.fn.ts`, same owner check, `{ requestId, viewKey? }`) sets the request to Cancelled while it is Requested, updates its entry in the order's `returns` and sends nothing; calling it again answers `changed: false`.
- Every callable that moves a request updates the order's summary with `withReturnStatus()` in the same transaction, so `returns` always matches `returnRequests/{id}`.
- Reject also passes its reason to `withReturnStatus(raw, id, 'rejected', { rejectReason })`, which saves it as `rejectReason` on that entry (trimmed; only with Rejected), so the shopper sees why.
- Refund Sent passes `{ refundSentEgp }`, which replaces the entry's `refundEgp` with the amount staff really sent, so the shopper's box shows what was sent.
- The request box never shows a refund of EGP 0 (the courier fee took it all): it then says the refund without an amount.
- `orderViewFields()` copies `returns` into `orderViews/{viewKey}` so guests see the status.
- Firestore rules: `returnRequests`, `returnStaffNotes` (staff-only history, written by the step callables) and `returnEmails` are read by admin and staff only, with no client writes; orders stay server-written, so `returns` is written only by Cloud Functions.

## Shopper screen (website)

- Feature folder: `src/app/features/returns/` (`dialogs/return-request-dialog`, `components/return-request-box`, `services/returns.service.ts`, `utils/`).
- `returnEntry(order, nowMs)` (`src/app/core/services/orders/order-returns.ts`) decides what the order page and Account → Orders show: the **Return or Exchange** button (`open`, with the last day), "Returns closed on 27 Nov. Message us on WhatsApp if something is wrong." (`closed`), or nothing; it wraps `returnEligibility()`.
- The order schema (`OrderSchema` and `OrderViewSchema`) keeps the order's `returns` raw; read it with `readReturnSummaries()`.
- The request screen opens with `RETURN_REQUEST_DIALOG_CONFIG` (`panelClass: 'return-request-pane'`: a 40rem dialog on desktop, full screen below 640 px in `_dialog.scss`).
- Account → Orders opens the order page with router state `{ openReturn: true }`, and the page opens the screen once the order loads (then clears the state so a reload doesn't reopen it).
- Sizes and colours are read live when an item asks for them (`ReturnsService.productReader()`: the product, and for Different Colour its `modelGroup` in one query), kept only while the screen is open; sold-out sizes and the size they have are disabled, colours with another price are greyed out.
- Send Another / Refund is a `mat-button-toggle-group.return-wants` (two equal halves, `_button-toggle.scss`).
- Send Request waits for `settings/shipping` when the order's delivery fee was 0, so the refund after the fee is never shown or saved without the fee.
- The button shows only while some piece is left to ask for (`piecesLeft()`).
- The refund, courier fee and returned gifts on the screen come from `returnPreview()` (`features/returns/utils/return-request.utils.ts`), which calls the same shared rules as `buildReturnRequest()`; the courier fee's box price uses the shared `normalBoxFeeEgp()` (`@core/config/returns`) with `ShippingSettingsService.settings()`, the same function `requestReturn` calls, so the fee on the screen and the saved fee never differ.
- Send Request calls `requestReturn`; errors show `callableMessage()`; on success the snackbar says "Request sent. We'll message you on WhatsApp."
- The order page shows `app-return-request-box` for each entry of the order's `returns`, newest first, live; **Cancel Request** (asks first) calls `cancelReturnRequest` while Requested.
- The box reads each item's `askedLabel`, `storeFault`, `refundEgp` and `rejectReason` from the order's `returns` summary (`readRequestDetails()`), so any browser shows the same box; for entries written before <KEY>-296 it falls back to what this browser sent (`localStorage.returnRequests`, `return-memory.ts`), else shows Refund / Exchange per item and no **Send Photos on WhatsApp**.

## Emails

- `sendReturnEmails` (`functions/src/email/send-return-emails.trigger.ts`, `onDocumentWritten returnRequests/{requestId}`, `europe-west3`, no retry) sends through Resend like the order emails.
- Which email: `returnEmailsForWrite()` in `return-email-events.ts`; a new Requested request sends `store-return-request` (to `STORE_ALERT_EMAIL`) and `return-requested` (to the shopper).
- Each (request, email) is claimed in `returnEmails/{requestId}_{kind}` (`create()`, then `sent` or `failed`), so a repeated trigger never sends twice; a failure is not retried automatically.
- Templates are in `return-email-templates.ts` ("Bold Black" blocks from `email-blocks.ts`), each with a plain-text version; the shared links and WhatsApp context come from `emailContext()` in `email-context.ts`.
- Staff alert: kicker `RETURN REQUEST · 13 NOV · 14:32` (Cairo), the request ref very large, `For order #A1B2C3 · delivered 10 Nov`, a strip of Items, Refund and Courier Fee (with "off the refund", "cash at the door" or "the store pays"), the next-step box "Approve or reject this request", the customer with **Message Customer on WhatsApp** (`returnStaffWhatsappText()`), What They Asked For (×N tag, `askedLabel`, refund amount, gifts as strips), the customer's note, the money and **Open Request** to `/admin/returns/<id>`.
- Shopper email: header with the order ref, kicker `RETURN OR EXCHANGE · #R-…`, status `REQUEST SENT`, What Happens Next (we check it, the courier comes to the delivery address, the InstaPay refund), Your Items, the money, **View Your Order** (`orderConfirmationUrl()`, with `?key=` for guests).
- Damaged or wrong items add a dashed box with **Send Photos on WhatsApp**, prefilled with the request and order refs (`returnPhotosWhatsappText()`); without a store WhatsApp it asks for a reply with a photo when replies reach an inbox.
- The Approved, Rejected, Received and Refund Sent emails come in <KEY>-294.

## Staff steps (admin Returns)

- `/admin/returns` (`ReturnsManagerPageComponent`, `features/admin/pages/returns-manager/`) lists requests newest first, 20 per **Show More Requests**, with tabs Requested, Approved, Received, Refund Sent, Rejected, Cancelled, All (index `returnRequests` `status` + `createdAt` desc); the search field filters the requests on screen.
- The admin menu's **Returns** item shows the count of Requested (`AdminNavService`, `getCountFromServer`), read again after each step (`refreshReturnsCount()`).
- `/admin/returns/:requestId` (`ReturnDetailsPageComponent`) shows refs (order ref links to `/admin/orders/:id`), the customer with **Message Customer on WhatsApp** (`returnStaffWhatsappText()`), items with photo, options, what was asked and live stock per piece (now and what each step does), money, the shopper's InstaPay details and note, and the staff history.
- `/admin/orders/:id` and the open order in the Orders list show a **Returns** line (`app-order-returns-line`, reads `returnRequests` by `orderId`).
- Callables (`europe-west3`, `requireRole`): `approveReturnRequest`, `rejectReturnRequest`, `receiveReturnRequest` (admin and staff) and `markRefundSent` (admin only, checked on the server).
- All four run `runReturnStep()` (`functions/src/returns/return-staff-transaction.ts`): one transaction reads the request, order and products, checks the move with `nextReturnStatuses()`, moves stock, stamps the request, updates the order's `returns` with `withReturnStatus()` and appends `{ status, from, at, by, byEmail?, reason? }` to `returnStaffNotes/{id}.history`.
- The pure part is `functions/src/returns/return-staff-step.ts` (input checks, `withSentPieces()`, `approveStep()`, `receiveStep()`, `rejectUndoStep()`, `applyStockMoves()`), tested in `return-staff-step.test.ts`.
- Already in the target status answers `changed: false` and writes nothing, so a double click or two staff at once never move stock twice.
- Approve: Wrong Item Sent first asks "What Did We Send Instead?" (`app-sent-piece-picker` searches any product with `ProductsAdminService.searchProducts()`, then a size) and saves `sentProductId` / `sentSelection` on the item.
- Approve applies the plan's Approve moves once (`stockTakenAt`) and saves them as `approveStock`; a sold-out new piece refuses with "Size L is sold out. Ask the customer to pick another size or switch this item to a refund." and nothing changes.
- Reject needs a reason the shopper sees (300 characters, `rejectReason`), works from Requested or Approved, and from Approved undoes `approveStock` once (`stockUndoneAt`); a count that is too low stops at 0 so a reject is never blocked.
- Item Received (from Approved) saves each item's `canBeSoldAgain` (on by default, off for Damaged Item, always on for Wrong Item Sent, which shows no switch) and puts those pieces back once (`stockReturnedAt`); exchange-only requests are done here.
- Refund Sent (admin, from Received with a refund) saves `refundSentEgp` and an optional `refundReference`; no stock moves.
- Stamps: `approvedAt` / `approvedBy`, `rejectedAt` / `rejectedBy`, `receivedAt` / `receivedBy`, `refundSentAt` / `refundSentBy`.
- Pieces whose product or size is gone are counted in `stockNotReturned` and the snackbar asks staff to check that product.

## How items come back

- The courier collects from the order's delivery address, the same way it was delivered; an exchange is one visit that swaps at the door.
- The website doesn't connect to the courier.
