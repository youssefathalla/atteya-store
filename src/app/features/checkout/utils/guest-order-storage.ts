import { isOrderViewKey } from '@core/services/orders/order.schema';

/**
 * What this browser remembers about a guest order, so its order page still opens after the key
 * leaves the address bar: the view key, the email it was placed with (shown in the account card)
 * and whether the shopper skipped the account offer. `localStorage`, one entry per order.
 */
export interface GuestOrderMemory {
  readonly key: string | null;
  readonly email: string | null;
  readonly skipped: boolean;
}

const PREFIX = 'atteya-guest-order:';
const EMPTY: GuestOrderMemory = { key: null, email: null, skipped: false };

export function readGuestOrder(orderId: string): GuestOrderMemory {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + orderId);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw) as Partial<Record<keyof GuestOrderMemory, unknown>>;
    return {
      key: isOrderViewKey(data.key) ? data.key : null,
      email: typeof data.email === 'string' && data.email.length <= 254 ? data.email : null,
      skipped: data.skipped === true,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Merges `patch` into what is saved for the order. Returns false when storage is missing or
 * blocked (nothing was saved), so callers can keep anything they would otherwise lose.
 */
export function rememberGuestOrder(orderId: string, patch: Partial<GuestOrderMemory>): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const next = { ...readGuestOrder(orderId), ...patch };
    storage.setItem(PREFIX + orderId, JSON.stringify(next));
    return true;
  } catch {
    // Storage blocked: the page still works from the link for this visit.
    return false;
  }
}

/** Set before a Google redirect from the account card, so the order is saved when the page loads again. */
const CLAIM_AFTER_REDIRECT_KEY = 'atteya-claim-after-google';

export function markClaimAfterRedirect(orderId: string): void {
  try {
    globalThis.sessionStorage?.setItem(CLAIM_AFTER_REDIRECT_KEY, orderId);
  } catch {
    // Storage blocked: the shopper presses Save to My Account after coming back.
  }
}

/** True once (and forgets it) when a Google redirect started from this order's account card. */
export function takeClaimAfterRedirect(orderId: string): boolean {
  try {
    const pending = globalThis.sessionStorage?.getItem(CLAIM_AFTER_REDIRECT_KEY);
    if (pending !== orderId) return false;
    globalThis.sessionStorage?.removeItem(CLAIM_AFTER_REDIRECT_KEY);
    return true;
  } catch {
    return false;
  }
}
