import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas';

const currencyFactorsSchema = v.object({
  factor: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  step: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  decimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4)),
});

export const PublicCurrencySchema = v.object({
  base: v.literal('EGP'),
  currencies: v.record(v.string(), currencyFactorsSchema),
  ratesUpdatedAt: v.optional(timestampSchema),
  updatedAt: v.optional(timestampSchema),
});

export type PublicCurrencyDoc = v.InferOutput<typeof PublicCurrencySchema>;
export type PublicCurrencyMap = PublicCurrencyDoc['currencies'];
