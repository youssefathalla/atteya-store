import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import type { CartLineDraft, CartLineGift } from '@core/services/cart/cart.model';
import type { OrderPricingSnapshot } from '@core/services/orders/order-pricing.model';

export type CheckoutPaymentMethod = 'paymob' | 'cash-on-delivery' | 'instapay';
/** Egypt-only methods that staff confirm by hand. */
export type ManualCheckoutPaymentMethod = 'cash-on-delivery' | 'instapay';

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

/** One bag line as the order callables read it. Prices are never sent. */
interface CheckoutLineInput {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
  readonly selection: Readonly<Record<string, string>>;
  /** Picked free gifts; the server re-checks the offer, the choice and the stock. */
  readonly gifts: readonly CartLineGift[];
}

function toCheckoutLine(line: CartLineDraft): CheckoutLineInput {
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
  };
}

export interface CreatePaymobOrderResult {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: 'paymob';
  readonly pricing: OrderPricingSnapshot;
  readonly checkoutUrl: string;
}

export interface CreateManualOrderResult<
  M extends ManualCheckoutPaymentMethod = ManualCheckoutPaymentMethod,
> {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: M;
  readonly pricing: OrderPricingSnapshot;
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
  }): Promise<CreatePaymobOrderResult> {
    const call = await callableFrom<
      {
        lines: readonly CheckoutLineInput[];
        shipping: CheckoutShippingInput;
        paymentMethod: 'paymob';
        endedOfferIds: readonly string[];
        dealOfferIds: readonly string[];
      },
      CreatePaymobOrderResult
    >(this.#functions(), 'createPaymobOrder');
    const response = await call({
      lines: args.lines.map(toCheckoutLine),
      shipping: args.shipping,
      paymentMethod: 'paymob',
      endedOfferIds: args.endedOfferIds,
      dealOfferIds: args.dealOfferIds,
    });
    return response.data;
  }

  /** Egypt-only orders confirmed by staff: cash on delivery or InstaPay. */
  async placeManualOrder<M extends ManualCheckoutPaymentMethod>(args: {
    readonly method: M;
    readonly lines: readonly CartLineDraft[];
    readonly shipping: CheckoutShippingInput;
    readonly endedOfferIds: readonly string[];
    /** Buy X Get Y offers the summary priced with; the server refuses rather than drop one. */
    readonly dealOfferIds: readonly string[];
  }): Promise<CreateManualOrderResult<M>> {
    const call = await callableFrom<
      {
        lines: readonly CheckoutLineInput[];
        shipping: CheckoutShippingInput;
        paymentMethod: M;
        endedOfferIds: readonly string[];
        dealOfferIds: readonly string[];
      },
      CreateManualOrderResult<M>
    >(this.#functions(), args.method === 'instapay' ? 'createInstapayOrder' : 'createCodOrder');
    const response = await call({
      lines: args.lines.map(toCheckoutLine),
      shipping: args.shipping,
      paymentMethod: args.method,
      endedOfferIds: args.endedOfferIds,
      dealOfferIds: args.dealOfferIds,
    });
    return response.data;
  }
}
