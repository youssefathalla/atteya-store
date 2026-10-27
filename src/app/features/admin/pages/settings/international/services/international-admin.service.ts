import { Service } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import * as v from 'valibot';
import { injectFunctions } from '@core/firebase';

const SaveSchema = v.object({
  markupPercent: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(200)),
});

const RefreshSchema = v.object({
  ok: v.boolean(),
  fetchedAt: v.nullable(v.string()),
  warnings: v.array(v.string()),
  error: v.nullable(v.string()),
});

export type RefreshRatesResult = v.InferOutput<typeof RefreshSchema>;

@Service()
export class InternationalAdminService {
  readonly #functions = injectFunctions();
  readonly #save = httpsCallable<{ markupPercent: number }, unknown>(
    this.#functions,
    'setInternationalPricing',
  );
  readonly #refresh = httpsCallable<Record<string, never>, unknown>(
    this.#functions,
    'refreshExchangeRatesNow',
  );

  async saveMarkup(markupPercent: number): Promise<number> {
    const result = await this.#save({ markupPercent });
    const parsed = v.safeParse(SaveSchema, result.data);
    if (!parsed.success) {
      throw new Error('The markup was saved, but the response was unexpected. Refresh the page.');
    }
    return parsed.output.markupPercent;
  }

  async refreshRates(): Promise<RefreshRatesResult> {
    const result = await this.#refresh({});
    const parsed = v.safeParse(RefreshSchema, result.data);
    if (!parsed.success) {
      throw new Error('Rates were refreshed, but the response was unexpected. Refresh the page.');
    }
    return parsed.output;
  }
}
