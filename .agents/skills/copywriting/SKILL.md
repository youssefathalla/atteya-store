---
name: copywriting
description: House style for every word a shopper, staff member or client reads in Atteya Store (website, admin, dialogs, snackbars, emails, WhatsApp messages). Use before writing or changing any user-facing text, button label, email template or pre-written WhatsApp message.
---

# Copywriting: How Atteya Store Writes

Every rule here came from a real correction by Youssef. Follow it the first time.

## 1. Capitals

| What | Style | Examples |
| :--- | :--- | :--- |
| Buttons, menu items, dialog actions, email buttons | **Title case** | Place Order, Add to Bag, Send on WhatsApp, Message Us on WhatsApp, Back to the Store, Open Orders in the Dashboard |
| Payment method and order status names (anywhere, also inside sentences) | **Title case** | InstaPay, Card or Wallet, Cash on Delivery, Waiting for Payment, Waiting for Transfer, Payment Failed |
| Email headings, labels and row names | **Title case** | New Order #A1B2C3, Delivery Address, Customer, Shipping Fee, Cash at the Door |
| Sentences, hints, snackbars, helper text, aria-labels | Sentence case | "We'll confirm your order as soon as we receive your payment." |
| Stock badges and table values | Sentence case | In stock, Out of stock, Not set |

Title case = capital on every main word; these small words stay lower case unless they are first or last: a, an, the, and, or, but, of, on, in, at, to, by, for, with, from. Brand words keep their own spelling: InstaPay, WhatsApp, Paymob.

## 2. Say each thing once

- Don't repeat the same word or fact in a heading, a step and the button next to it. Example: step "Send us a screenshot of the transfer." + button **Send on WhatsApp** (not "Send screenshot on WhatsApp").
- An amount appears once per block. Put it in the heading ("Pay EGP 429 by InstaPay"), not again in the step under it.
- Don't make a section intro list what the section below already lists.
- A row inside a box must not repeat the box title (box "Cash on Delivery" → row "Cash at the Door", not "Cash on delivery").
- Shortest clear label wins: "Shipping Fee", not "Shipping fee by InstaPay" when the note under it already says InstaPay.

## 3. Plain, outcome-first words

- Say what happens to the person, not what the system does: "We'll send your order once we receive the shipping fee." Not "Order status will update after verification."
- No jargon: no "callable", "webhook", "document", "sync", "fulfilment" in UI text.
- Calm and helpful in errors: what went wrong in everyday words, then what to do.

## 4. Money, numbers and order refs

- Website and emails: `EGP 1,500` (from `formatMoney(…, 'EGP', 0)` / `formatEgp()`), whole pounds, "Free" for zero shipping.
- Arabic WhatsApp texts: English digits and `1,500 EGP` (`formatEgpPlain()`), order ref `#A1B2C3`.
- Amounts only from the saved order. Never guess a missing amount; leave it out.
- Order refs come from `shortOrderRef()`: `#` + 6 capitals.

## 5. Messages must match the order exactly

All payment wording comes from `orderStage()` / `paymentDue()` in `functions/src/store/order-messages.ts` (synced to `src/app/core/config/`). Never decide from defaults or the checkout seed.

- InstaPay order = the shopper pays the **full total**. Cash on Delivery = the **shipping fee** by InstaPay first, the rest in cash at the door. Free shipping = nothing to pay now.
- A paid order never asks for money or a screenshot. It gets a confirmation.
- Abroad orders never mention InstaPay, a deposit, cash or EGP amounts in WhatsApp texts.
- While a card payment is still confirming, show no WhatsApp button.

## 6. Languages

- Website, admin and emails: English.
- Pre-written WhatsApp messages (`shopperWhatsappText`, `staffWhatsappText`): Egyptian Arabic, English digits, greeting with the first name and the order ref.

## 7. Before you finish

- Read every new string out loud next to what's around it: is anything said twice?
- Check capitals against the table in section 1.
- Update the matching tests (`functions/src/email/order-emails.spec.ts`, `functions/src/store/order-messages.spec.ts`) when wording changes, and keep `AGENTS.md` examples in step.
