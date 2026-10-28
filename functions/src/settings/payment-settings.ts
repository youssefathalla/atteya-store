export const PAYMENTS_DOC_PATH = 'settings/payments';

/** Dev-safe placeholders until an admin saves real bank details in Settings → Payments. */
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  beneficiaryName: 'Atteya Store',
  bankName: 'Demo Bank (dev only)',
  iban: 'EG380019000500000000263180002',
  whatsAppNumber: '201234567890',
  internationalShippingFeeEgp: 750,
};

export interface PaymentSettings {
  readonly beneficiaryName: string;
  readonly bankName: string;
  readonly iban: string;
  readonly whatsAppNumber: string;
  readonly internationalShippingFeeEgp: number;
}

const IBAN_PATTERN = /^[A-Z]{2}[0-9A-Z]{13,32}$/;
const PHONE_PATTERN = /^[0-9]{8,15}$/;

export function parsePaymentSettings(data: Record<string, unknown> | undefined): PaymentSettings {
  const beneficiaryName = readTrimmed(data?.['beneficiaryName'], DEFAULT_PAYMENT_SETTINGS.beneficiaryName);
  const bankName = readTrimmed(data?.['bankName'], DEFAULT_PAYMENT_SETTINGS.bankName);
  const ibanRaw = readTrimmed(data?.['iban'], DEFAULT_PAYMENT_SETTINGS.iban)
    .replace(/\s+/g, '')
    .toUpperCase();
  const iban = IBAN_PATTERN.test(ibanRaw) ? ibanRaw : DEFAULT_PAYMENT_SETTINGS.iban;
  const whatsAppNumber = normalizePhone(data?.['whatsAppNumber']) ?? DEFAULT_PAYMENT_SETTINGS.whatsAppNumber;
  const internationalShippingFeeEgp = readFee(
    data?.['internationalShippingFeeEgp'],
    DEFAULT_PAYMENT_SETTINGS.internationalShippingFeeEgp,
  );
  return { beneficiaryName, bankName, iban, whatsAppNumber, internationalShippingFeeEgp };
}

export function paymentSeedData(): Record<string, unknown> {
  return { ...DEFAULT_PAYMENT_SETTINGS };
}

function readTrimmed(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (!PHONE_PATTERN.test(digits)) return null;
  return digits;
}

function readFee(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 1_000_000) return fallback;
  return rounded;
}
