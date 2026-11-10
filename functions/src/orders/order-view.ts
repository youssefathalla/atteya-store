import { randomBytes } from 'node:crypto';

/** Collection of public, read-by-key copies of guest orders (`orderViews/{viewKey}`). */
export const ORDER_VIEWS_COLLECTION = 'orderViews';

/** A guest order's secret view key: 32 random bytes, base64url (43 characters). */
export function newOrderViewKey(): string {
  return randomBytes(32).toString('base64url');
}

/** True for a string shaped like a view key (base64url, 43 characters). */
export function isOrderViewKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * What `orderViews/{viewKey}` holds for a guest order: only the fields the confirmation page reads.
 * Never staff-only fields (`confirmedBy`, `cancelledBy`, `deliveryFeeSetBy`, `stockIssues`, Paymob
 * intention ids), the customer's email or uid, or the key itself.
 */
export function orderViewFields(
  orderId: string,
  data: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const paymob = isRecord(data['paymob']) ? data['paymob'] : null;
  return {
    id: orderId,
    status: data['status'] ?? null,
    paymentMethod: data['paymentMethod'] ?? null,
    pricing: data['pricing'] ?? null,
    shipping: data['shipping'] ?? null,
    paymob: paymob
      ? {
          amountCents: paymob['amountCents'] ?? null,
          currency: paymob['currency'] ?? null,
          paidAt: paymob['paidAt'] ?? null,
        }
      : null,
    needsReview: data['needsReview'] === true,
    createdAt: data['createdAt'] ?? null,
    updatedAt: data['updatedAt'] ?? null,
    confirmedAt: data['confirmedAt'] ?? null,
    cancelledAt: data['cancelledAt'] ?? null,
    deliveryFeeSetAt: data['deliveryFeeSetAt'] ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
