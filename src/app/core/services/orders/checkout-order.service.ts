import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import type { OrderPricingSnapshot } from '@core/services/orders/order-pricing.model';

export interface CheckoutShippingInput {
  readonly fullName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string;
  readonly country: string;
  readonly phone: string;
}

export interface CreateIntlBankTransferOrderResult {
  readonly orderId: string;
  readonly transferReference: string;
  readonly status: 'pending';
  readonly pricing: OrderPricingSnapshot;
  readonly iban: string;
  readonly beneficiaryName: string;
  readonly bankName: string;
  readonly whatsAppProofUrl: string | null;
}

@Service()
export class CheckoutOrderService {
  readonly #functions = injectFunctionsAsync();

  async placeInternationalBankTransferOrder(args: {
    readonly lines: readonly CartLineDraft[];
    readonly shipping: CheckoutShippingInput;
  }): Promise<CreateIntlBankTransferOrderResult> {
    const call = await callableFrom<
      {
        lines: readonly {
          productId: string;
          variantId: string | null;
          quantity: number;
          selection: Readonly<Record<string, string>>;
        }[];
        shipping: CheckoutShippingInput;
      },
      CreateIntlBankTransferOrderResult
    >(this.#functions(), 'createInternationalBankTransferOrder');
    const response = await call({
      lines: args.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        selection: line.selection,
      })),
      shipping: args.shipping,
    });
    return response.data;
  }

  async registerPaymentProof(orderId: string, storagePath: string): Promise<void> {
    const call = await callableFrom<
      { orderId: string; storagePath: string },
      { orderId: string; paymentProofPath: string }
    >(this.#functions(), 'registerOrderPaymentProof');
    await call({ orderId, storagePath });
  }
}
