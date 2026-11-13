import { Service, inject } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';
import type { ReturnKind, ReturnReason, ReturnWants } from '@core/config/returns';
import { ProductService, type Product } from '@core/services/products';

export interface RequestReturnItem {
  readonly lineIndex: number;
  readonly quantity: number;
  readonly kind: ReturnKind;
  readonly reason?: ReturnReason;
  readonly wants?: ReturnWants;
  readonly size?: string;
  readonly colourProductId?: string;
}

export interface RequestReturnData {
  readonly orderId: string;
  readonly viewKey?: string;
  readonly items: readonly RequestReturnItem[];
  readonly note?: string;
  readonly refundTo?: string;
}

export interface RequestReturnResult {
  readonly requestId: string;
  readonly ref: string;
}

/** A product they have and the model's other colours, read live for Different Size / Different Colour. */
export interface ReturnProductChoices {
  readonly product: Product | null;
  readonly siblings: readonly Product[];
}

/**
 * Sends and cancels return or exchange requests (`requestReturn`, `cancelReturnRequest`, ATS-291)
 * and reads the products a request can swap to. Product reads are kept for the page's life, so
 * switching an item between kinds reads nothing again.
 */
@Service()
export class ReturnsService {
  readonly #functions = injectFunctionsAsync();
  readonly #products = inject(ProductService);
  readonly #cache = new Map<string, Promise<Product | null>>();

  async requestReturn(data: RequestReturnData): Promise<RequestReturnResult> {
    const call = await callableFrom<RequestReturnData, RequestReturnResult>(
      this.#functions(),
      'requestReturn',
    );
    return (await call(data)).data;
  }

  async cancelReturnRequest(requestId: string, viewKey: string | null): Promise<void> {
    const call = await callableFrom<{ requestId: string; viewKey?: string }, unknown>(
      this.#functions(),
      'cancelReturnRequest',
    );
    await call(viewKey ? { requestId, viewKey } : { requestId });
  }

  /** Each product (by id) with its model's other colours. Missing or hidden products read as null. */
  async choicesFor(productIds: readonly string[]): Promise<ReadonlyMap<string, ReturnProductChoices>> {
    const out = new Map<string, ReturnProductChoices>();
    await Promise.all(
      productIds.map(async (id) => {
        const product = await this.#product(id);
        const siblingIds = (product?.colorSiblings ?? [])
          .map((entry) => entry.id)
          .filter((other) => other !== id);
        const siblings = await Promise.all(siblingIds.map((other) => this.#product(other)));
        out.set(id, {
          product,
          siblings: siblings.filter((other): other is Product => other !== null),
        });
      }),
    );
    return out;
  }

  #product(id: string): Promise<Product | null> {
    let pending = this.#cache.get(id);
    if (!pending) {
      pending = this.#products
        .getById(id)
        .then((product) => (product?.published ? product : null))
        .catch((error: unknown) => {
          this.#cache.delete(id);
          throw error;
        });
      this.#cache.set(id, pending);
    }
    return pending;
  }
}
