import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas';

const fee = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));
const iban = v.pipe(v.string(), v.trim(), v.minLength(15), v.maxLength(34));
const phone = v.pipe(v.string(), v.trim(), v.minLength(8), v.maxLength(20));

export const PaymentSettingsSchema = v.object({
  beneficiaryName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  bankName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  iban,
  whatsAppNumber: phone,
  internationalShippingFeeEgp: fee,
  updatedAt: v.optional(timestampSchema),
  updatedBy: v.optional(v.string()),
});

export type PaymentSettingsDoc = v.InferOutput<typeof PaymentSettingsSchema>;

export const DEFAULT_PAYMENT_SETTINGS_DOC: PaymentSettingsDoc = {
  beneficiaryName: 'Atteya Store',
  bankName: 'Demo Bank (dev only)',
  iban: 'EG380019000500000000263180002',
  whatsAppNumber: '201234567890',
  internationalShippingFeeEgp: 750,
};
