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
  /** False when only the sizes were asked for (`siblings` is then empty). */
  readonly withColours: boolean;
}

export interface ProductChoiceRequest {
  readonly productId: string;
  readonly withColours: boolean;
}

/**
 * Sends and cancels return or exchange requests (`requestReturn`, `cancelReturnRequest`, ATS-291)
 * and reads the products a request can swap to (`productReader()`).
 */
@Service()
export class ReturnsService {
  readonly #functions = injectFunctionsAsync();
  readonly #products = inject(ProductService);

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

  /**
   * A reader for one request screen: each product (by id), with its model's other colours when
   * `withColours` (one query). Reads are kept for that screen only, so reopening it shows live stock.
   * Missing or hidden products read as null.
   */
  productReader(): (
    requests: readonly ProductChoiceRequest[],
  ) => Promise<ReadonlyMap<string, ReturnProductChoices>> {
    const products = new Map<string, Promise<Product | null>>();
    const groups = new Map<string, Promise<readonly Product[]>>();
    const remember = <T>(cache: Map<string, Promise<T>>, key: string, read: () => Promise<T>): Promise<T> => {
      let pending = cache.get(key);
      if (!pending) {
        pending = read().catch((error: unknown) => {
          cache.delete(key);
          throw error;
        });
        cache.set(key, pending);
      }
      return pending;
    };
    return async (requests) => {
      const out = new Map<string, ReturnProductChoices>();
      await Promise.all(
        requests.map(async ({ productId, withColours }) => {
          const product = await remember(products, productId, async () => {
            const found = await this.#products.getById(productId);
            return found?.published ? found : null;
          });
          const group = product?.modelGroup;
          const siblings =
            withColours && group
              ? await remember(groups, group, () => this.#products.listModelGroup(group, 12))
              : [];
          out.set(productId, { product, siblings, withColours });
        }),
      );
      return out;
    };
  }
}
