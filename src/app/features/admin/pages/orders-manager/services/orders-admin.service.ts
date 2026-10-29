import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';

export interface ConfirmCodOrderResult {
  readonly orderId: string;
  readonly status: 'confirmed';
  readonly stockDecremented: boolean;
}

/** Admin callables for open orders. Kept separate from the list page so AS-4 stock UI can extend the page without colliding. */
@Service()
export class OrdersAdminService {
  readonly #functions = injectFunctionsAsync();

  async confirmCodOrder(orderId: string): Promise<ConfirmCodOrderResult> {
    const call = await callableFrom<{ orderId: string }, ConfirmCodOrderResult>(
      this.#functions(),
      'confirmCodOrder',
    );
    const response = await call({ orderId });
    return response.data;
  }
}
