import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import type { OrderPricingSnapshot } from '@core/services/orders/order-pricing.model';

export type CheckoutPaymentMethod = 'paymob' | 'cash-on-delivery';

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

export interface CreateCodOrderResult {
  readonly orderId: string;
  readonly status: 'pending';
  readonly paymentMethod: 'cash-on-delivery';
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

  async placeCodOrder(args: {
    readonly lines: readonly CartLineDraft[];
    readonly shipping: CheckoutShippingInput;
  }): Promise<CreateCodOrderResult> {
    const call = await callableFrom<
      {
        lines: readonly {
          productId: string;
          variantId: string | null;
          quantity: number;
          selection: Readonly<Record<string, string>>;
        }[];
        shipping: CheckoutShippingInput;
        paymentMethod: 'cash-on-delivery';
      },
      CreateCodOrderResult
    >(this.#functions(), 'createCodOrder');
    const response = await call({
      lines: args.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        selection: line.selection,
      })),
      shipping: args.shipping,
      paymentMethod: 'cash-on-delivery',
    });
    return response.data;
  }
}
