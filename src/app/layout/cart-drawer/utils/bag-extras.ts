import type { SearchHit } from '@core/services/search/search.model';
import { PAYMENT_METHODS, type PaymentMethodId } from '@shared/ui/payment-mark';

/** Most product cards in the phone bag's "Recommended for You" row. */
export const BAG_RECOMMENDATION_LIMIT = 4;

/**
 * Hits asked from search for that row: the limit plus room for every product already in the
 * bag (at most 20 lines), so leaving those out still leaves up to 4 cards.
 */
export const BAG_RECOMMENDATION_FETCH = BAG_RECOMMENDATION_LIMIT + 20;

/** One row in the bag's "Payment Methods" list. */
export interface BagPaymentMethod {
  readonly id: PaymentMethodId;
  readonly name: string;
  readonly comingSoon: boolean;
}

function bagMethod(id: PaymentMethodId, comingSoon = false): BagPaymentMethod {
  return { id, name: PAYMENT_METHODS[id].name, comingSoon };
}

/**
 * The payment methods checkout offers, in checkout's order: InstaPay, Card and
 * Cash on Delivery in Egypt; Bank Transfer (while an IBAN is set) and Card abroad. While the
 * Paymob switch (`STORE_INFO.payments.cardOrWallet`) is off, Card is marked "Coming soon" and
 * comes last, after the methods shoppers can use today (checkout does the same).
 */
export function bagPaymentMethods(
  isEgypt: boolean,
  cardOrWalletLive: boolean,
  bankTransferLive = false,
): readonly BagPaymentMethod[] {
  const cardOrWallet = bagMethod('paymob', !cardOrWalletLive);
  if (!isEgypt) return bankTransferLive ? [bagMethod('bank-transfer'), cardOrWallet] : [cardOrWallet];
  return cardOrWalletLive
    ? [bagMethod('instapay'), cardOrWallet, bagMethod('cash-on-delivery')]
    : [bagMethod('instapay'), bagMethod('cash-on-delivery'), cardOrWallet];
}

/**
 * Algolia filter for products in any of the bag's categories that are in stock. The index
 * only holds published products. Null when the bag has no category to match.
 */
export function bagRecommendationFilter(categoryIds: readonly string[]): string | null {
  const ids = categoryIds.filter((id) => /^[a-z0-9-]+$/.test(id));
  if (ids.length === 0) return null;
  const anyCategory = ids.map((id) => `categoryIds:"${id}"`).join(' OR ');
  return `inStock:true AND (${anyCategory})`;
}

/** Up to `BAG_RECOMMENDATION_LIMIT` hits, leaving out products already in the bag. */
export function pickBagRecommendations(
  hits: readonly SearchHit[],
  bagProductIds: ReadonlySet<string>,
): readonly SearchHit[] {
  return hits
    .filter((hit) => hit.inStock && !bagProductIds.has(hit.objectID))
    .slice(0, BAG_RECOMMENDATION_LIMIT);
}
