import type { DocumentData } from 'firebase-admin/firestore';
import type { ShippingSettings, ShippingZone } from '../offers/engine/index.js';

export const SHIPPING_DOC_PATH = 'settings/shipping';

export const DEFAULT_SHIPPING_NOTE =
  'Shipping fee is paid upfront; the rest is paid on delivery. Delivery in 1\u20134 days.';

/** Flat international box fee (EGP) until AS-16 shipping boxes land. */
export const DEFAULT_INTERNATIONAL_SHIPPING_FEE_EGP = 750;

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  currency: 'EGP',
  baseFee: 125,
  zones: [
    { id: 'cairo', name: 'Cairo', fee: 115, governorates: ['cairo'] },
    { id: 'alexandria', name: 'Alexandria', fee: 110, governorates: ['alexandria'] },
    {
      id: 'upper-egypt',
      name: 'Upper Egypt',
      fee: 150,
      governorates: [
        'beni-suef',
        'fayoum',
        'minya',
        'asyut',
        'sohag',
        'qena',
        'luxor',
        'aswan',
      ],
    },
    { id: 'red-sea', name: 'Hurghada & Red Sea', fee: 160, governorates: ['red-sea'] },
  ],
  freeOver: { active: false, threshold: null },
  promo: {
    active: false,
    fee: 0,
    startsAt: null,
    endsAt: null,
    minSubtotal: null,
    banner: null,
  },
  note: DEFAULT_SHIPPING_NOTE,
};

export interface CheckoutShippingConfig {
  readonly settings: ShippingSettings;
  readonly internationalShippingFeeEgp: number;
}

/** Firestore-ready seed document (Dates are converted to Timestamps by the SDK). */
export function shippingSeedData(): Record<string, unknown> {
  return {
    currency: 'EGP',
    baseFee: DEFAULT_SHIPPING_SETTINGS.baseFee,
    zones: DEFAULT_SHIPPING_SETTINGS.zones.map((zone) => ({
      ...zone,
      governorates: [...zone.governorates],
    })),
    freeOver: { ...DEFAULT_SHIPPING_SETTINGS.freeOver },
    promo: { ...DEFAULT_SHIPPING_SETTINGS.promo },
    note: DEFAULT_SHIPPING_SETTINGS.note,
    internationalShippingFeeEgp: DEFAULT_INTERNATIONAL_SHIPPING_FEE_EGP,
  };
}

export function parseCheckoutShippingConfig(
  data: DocumentData | undefined,
): CheckoutShippingConfig {
  const base = DEFAULT_SHIPPING_SETTINGS;
  if (!data) {
    return {
      settings: base,
      internationalShippingFeeEgp: DEFAULT_INTERNATIONAL_SHIPPING_FEE_EGP,
    };
  }
  const zones = parseZones(data['zones']) ?? base.zones;
  const settings: ShippingSettings = {
    currency: 'EGP',
    baseFee: readFee(data['baseFee'], base.baseFee),
    zones,
    freeOver: parseFreeOver(data['freeOver']) ?? { ...base.freeOver },
    promo: parsePromo(data['promo']) ?? { ...base.promo },
    note: typeof data['note'] === 'string' ? data['note'] : base.note,
  };
  return {
    settings,
    internationalShippingFeeEgp: readFee(
      data['internationalShippingFeeEgp'],
      DEFAULT_INTERNATIONAL_SHIPPING_FEE_EGP,
    ),
  };
}

function parseZones(raw: unknown): readonly ShippingZone[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const zones: ShippingZone[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row['id'] === 'string' ? row['id'] : '';
    const name = typeof row['name'] === 'string' ? row['name'] : '';
    const fee = readFee(row['fee'], -1);
    const governorates = Array.isArray(row['governorates'])
      ? row['governorates'].filter((g): g is string => typeof g === 'string')
      : [];
    if (!id || !name || fee < 0) continue;
    zones.push({ id, name, fee, governorates });
  }
  return zones.length > 0 ? zones : null;
}

function parseFreeOver(
  raw: unknown,
): ShippingSettings['freeOver'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const active = row['active'] === true;
  const threshold =
    typeof row['threshold'] === 'number' && Number.isFinite(row['threshold'])
      ? Math.round(row['threshold'])
      : null;
  return { active, threshold };
}

function parsePromo(raw: unknown): ShippingSettings['promo'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    active: row['active'] === true,
    fee: readFee(row['fee'], 0),
    startsAt: toDate(row['startsAt']),
    endsAt: toDate(row['endsAt']),
    minSubtotal:
      typeof row['minSubtotal'] === 'number' && Number.isFinite(row['minSubtotal'])
        ? Math.round(row['minSubtotal'])
        : null,
    banner: typeof row['banner'] === 'string' ? row['banner'] : null,
  };
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object' && 'toDate' in raw && typeof (raw as { toDate: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

function readFee(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 1_000_000) return fallback;
  return rounded;
}
