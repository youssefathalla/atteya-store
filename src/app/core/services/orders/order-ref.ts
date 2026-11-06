/**
 * Short order number shown to shoppers and admins: `#` + the first 6 characters of
 * the order id in capitals (e.g. `#A1B2C3`). Order emails use the same format
 * (`shortOrderRef` in `functions/src/email/order-email-model.ts`); keep both identical.
 */
export function shortOrderRef(orderId: string): string {
  return `#${orderId.slice(0, 6).toUpperCase()}`;
}
