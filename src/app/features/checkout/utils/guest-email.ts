import * as v from 'valibot';

/** Same rule as the order callables (`GuestCheckoutSchema` in `functions/src/orders/order-request.ts`). */
const GuestEmailSchema = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(254), v.email());

/** The guest's email, trimmed and lower-cased like the server, or null when it is not a usable address. */
export function guestEmail(value: string): string | null {
  const result = v.safeParse(GuestEmailSchema, value);
  return result.success ? result.output : null;
}
