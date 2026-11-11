import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import type { ShownLinePrice } from '@core/services/cart/cart-deals';
import type { CartLineDraft, CartLineGift } from '@core/services/cart/cart.model';
import type { OrderPricingSnapshot } from '@core/services/orders/order-pricing.model';

export type CheckoutPaymentMethod = 'paymob' | 'cash-on-delivery' | 'instapay' | 'bank-transfer';
/**
 * Methods staff confirm by hand: Cash on Delivery and InstaPay (Egypt), Bank Transfer (outside Egypt).
 */
export type ManualCheckoutPaymentMethod = 'cash-on-delivery' | 'instapay' | 'bank-transfer';

/** The order callable behind each method staff confirm by hand. */
const MANUAL_CALLABLE: Record<ManualCheckoutPaymentMethod, string> = {
  'cash-on-delivery': 'createCodOrder',
  instapay: 'createInstapayOrder',
  'bank-transfer': 'createBankTransferOrder',
};

export interface CheckoutShippingInput {
  readonly fullName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string;
  readonly country: string;
  readonly phone: string;
  readonly governorateId: string | null;
}

/**
 * One bag line as the order callables read it. The price checkout showed is sent only so the
 * server can refuse rather than charge more; the server always prices the order itself.
 */
interface CheckoutLineInput {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly selection: Readonly<Record<string, string>>;
  /** Picked free gifts; the server re-checks the offer, the choice and the stock. */
  readonly gifts: readonly CartLineGift[];
  /** The per-piece price checkout showed; the server refuses rather than charge more. */
  readonly shownUnitEgp: number | null;
  /** The per-item offer behind that price, or null. */
  readonly shownOfferId: string | null;
  /** The per-piece price before per-item offers checkout showed; the server refuses rather than charge more. */
  readonly shownBaseEgp: number | null;
}

/**
 * The shipping fee and order total (whole EGP) checkout showed, sent only so the server can refuse
 * rather than charge more. While the fee is to be agreed later, `shippingEgp` is null and
 * `totalEgp` is the items total.
 */
export interface ShownOrderTotals {
  readonly shippingEgp: number | null;
  readonly totalEgp: number | null;
}

function toCheckoutLine(line: CartLineDraft, shown: ShownLinePrice | undefined): CheckoutLineInput {
  return {
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
    selection: line.selection,
    gifts: (line.gifts ?? []).map((gift) => ({
      offerId: gift.offerId,
      giftId: gift.giftId,
      productId: gift.productId,
      sizeId: gift.sizeId,
    })),
    shownUnitEgp: shown?.shownUnitEgp ?? null,
    shownOfferId: shown?.shownOfferId ?? null,
    shownBaseEgp: shown?.shownBaseEgp ?? null,
  };
}

function toCheckoutLines(
  lines: readonly CartLineDraft[],
  shown: readonly ShownLinePrice[],
): CheckoutLineInput[] {
  return lines.map((line, index) => toCheckoutLine(line, shown[index]));
}

export interface CreatePaymobOrderResult {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: 'paymob';
  readonly pricing: OrderPricingSnapshot;
  readonly checkoutUrl: string;
  /** A guest order's secret view key (its order link carries it); null when signed in. */
  readonly viewKey?: string | null;
}

export interface CreateManualOrderResult<
  M extends ManualCheckoutPaymentMethod = ManualCheckoutPaymentMethod,
> {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: M;
  readonly pricing: OrderPricingSnapshot;
  /** A guest order's secret view key (its order link carries it); null when signed in. */
  readonly viewKey?: string | null;
}

/** Ordering without signing in: the email the order is placed with. */
export interface GuestCheckoutInput {
  readonly email: string;
}

@Service()
export class CheckoutOrderService {
  readonly #functions = injectFunctionsAsync();

  async placePaymobOrder(args: {
    readonly lines: readonly CartLineDraft[];
    readonly shipping: CheckoutShippingInput;
    readonly endedOfferIds: readonly string[];
    /** Buy X Get Y offers the summary priced with; the server refuses rather than drop one. */
    readonly dealOfferIds: readonly string[];
    /** What the summary showed per line (same order as `lines`). */
    readonly shownPrices: readonly ShownLinePrice[];
    /** The shipping fee and total the summary showed; the server refuses rather than charge more. */
    readonly shownTotals: ShownOrderTotals;
    /** Set only when nobody is signed in; a signed-in call never sends it. */
    readonly guest: GuestCheckoutInput | null;
  }): Promise<CreatePaymobOrderResult> {
    const call = await callableFrom<
      {
        lines: readonly CheckoutLineInput[];
        shipping: CheckoutShippingInput;
        paymentMethod: 'paymob';
        endedOfferIds: readonly string[];
        dealOfferIds: readonly string[];
        shownShippingEgp: number | null;
        shownTotalEgp: number | null;
        guest?: GuestCheckoutInput;
      },
      CreatePaymobOrderResult
    >(this.#functions(), 'createPaymobOrder');
    const response = await call({
      lines: toCheckoutLines(args.lines, args.shownPrices),
      shipping: args.shipping,
      paymentMethod: 'paymob',
      endedOfferIds: args.endedOfferIds,
      dealOfferIds: args.dealOfferIds,
      shownShippingEgp: args.shownTotals.shippingEgp,
      shownTotalEgp: args.shownTotals.totalEgp,
      ...(args.guest ? { guest: { email: args.guest.email } } : {}),
    });
    return response.data;
  }

  /** Orders confirmed by staff: Cash on Delivery or InstaPay (Egypt), Bank Transfer (abroad). */
  async placeManualOrder<M extends ManualCheckoutPaymentMethod>(args: {
    readonly method: M;
    /**
     * Bank Transfer: the currency checkout showed prices in. The server checks it and works out
     * the amount to send itself (`pricing.payIn`). Ignored for the other methods.
     */
    readonly payInCurrency?: string | null;
    readonly lines: readonly CartLineDraft[];
    readonly shipping: CheckoutShippingInput;
    readonly endedOfferIds: readonly string[];
    /** Buy X Get Y offers the summary priced with; the server refuses rather than drop one. */
    readonly dealOfferIds: readonly string[];
    /** What the summary showed per line (same order as `lines`). */
    readonly shownPrices: readonly ShownLinePrice[];
    /** The shipping fee and total the summary showed; the server refuses rather than charge more. */
    readonly shownTotals: ShownOrderTotals;
    /** Set only when nobody is signed in; a signed-in call never sends it. */
    readonly guest: GuestCheckoutInput | null;
  }): Promise<CreateManualOrderResult<M>> {
    const call = await callableFrom<
      {
        lines: readonly CheckoutLineInput[];
        shipping: CheckoutShippingInput;
        paymentMethod: M;
        endedOfferIds: readonly string[];
        dealOfferIds: readonly string[];
        shownShippingEgp: number | null;
        shownTotalEgp: number | null;
        payInCurrency?: string;
        guest?: GuestCheckoutInput;
      },
      CreateManualOrderResult<M>
    >(this.#functions(), MANUAL_CALLABLE[args.method]);
    const response = await call({
      lines: toCheckoutLines(args.lines, args.shownPrices),
      shipping: args.shipping,
      paymentMethod: args.method,
      endedOfferIds: args.endedOfferIds,
      dealOfferIds: args.dealOfferIds,
      shownShippingEgp: args.shownTotals.shippingEgp,
      shownTotalEgp: args.shownTotals.totalEgp,
      ...(args.method === 'bank-transfer' && args.payInCurrency ? { payInCurrency: args.payInCurrency } : {}),
      ...(args.guest ? { guest: { email: args.guest.email } } : {}),
    });
    return response.data;
  }

  /**
   * Links a guest order to the signed-in account (`claimOrder`). The server needs the order's view
   * key and a confirmed account email equal to the order's email; anything else is refused.
   */
  async claimOrder(orderId: string, viewKey: string): Promise<void> {
    const call = await callableFrom<{ orderId: string; viewKey: string }, { orderId: string; claimed: true }>(
      this.#functions(),
      'claimOrder',
    );
    await call({ orderId, viewKey });
  }

  /**
   * Links every earlier guest order placed with the signed-in account's confirmed email
   * (`claimGuestOrdersByEmail`, at most 50 per call). Returns how many were linked; an unconfirmed
   * email links nothing.
   */
  async claimGuestOrdersByEmail(): Promise<number> {
    const call = await callableFrom<Record<string, never>, { linked: number }>(
      this.#functions(),
      'claimGuestOrdersByEmail',
    );
    const response = await call({});
    const linked = response.data?.linked;
    return typeof linked === 'number' && Number.isFinite(linked) ? linked : 0;
  }
}
