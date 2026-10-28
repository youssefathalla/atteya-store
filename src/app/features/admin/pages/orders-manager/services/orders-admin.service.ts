import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';

@Service()
export class OrdersAdminService {
  readonly #functions = injectFunctionsAsync();

  async confirmInternationalPayment(orderId: string): Promise<void> {
    const call = await callableFrom<{ orderId: string }, { orderId: string; status: 'confirmed' }>(
      this.#functions(),
      'confirmInternationalOrderPayment',
    );
    await call({ orderId });
  }
}
