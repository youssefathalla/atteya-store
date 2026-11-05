import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import type { CartLineDraft } from '@core/services/cart/cart.model';
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
  }): Promise<CreatePaymobOrderResult> {
    const call = await callableFrom<
      {
        lines: readonly {
          productId: string;
          variantId: string | null;
          quantity: number;
          selection: Readonly<Record<string, string>>;
        }[];
        shipping: CheckoutShippingInput;
        paymentMethod: 'paymob';
      },
      CreatePaymobOrderResult
    >(this.#functions(), 'createPaymobOrder');
    const response = await call({
      lines: args.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        selection: line.selection,
      })),
      shipping: args.shipping,
      paymentMethod: 'paymob',
    });
    return response.data;
  }

  /** Egypt-only orders confirmed by staff: cash on delivery or InstaPay. */
  async placeManualOrder<M extends ManualCheckoutPaymentMethod>(args: {
    readonly method: M;
    readonly lines: readonly CartLineDraft[];
    readonly shipping: CheckoutShippingInput;
  }): Promise<CreateManualOrderResult<M>> {
    const call = await callableFrom<
      {
        lines: readonly {
          productId: string;
          variantId: string | null;
          quantity: number;
          selection: Readonly<Record<string, string>>;
        }[];
        shipping: CheckoutShippingInput;
        paymentMethod: M;
      },
      CreateManualOrderResult<M>
    >(this.#functions(), args.method === 'instapay' ? 'createInstapayOrder' : 'createCodOrder');
    const response = await call({
      lines: args.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        selection: line.selection,
      })),
      shipping: args.shipping,
      paymentMethod: args.method,
    });
    return response.data;
  }
}
