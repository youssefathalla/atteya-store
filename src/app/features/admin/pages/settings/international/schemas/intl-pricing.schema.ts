import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas';

export const IntlConfigSchema = v.object({
  markupPercent: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(200)),
});

export const IntlRatesSchema = v.object({
  rates: v.optional(v.record(v.string(), v.number()), {}),
  providerUpdatedAt: v.optional(timestampSchema),
  fetchedAt: v.optional(timestampSchema),
  lastError: v.optional(v.nullable(v.string()), null),
});

export type IntlConfigDoc = v.InferOutput<typeof IntlConfigSchema>;
export type IntlRatesDoc = v.InferOutput<typeof IntlRatesSchema>;
