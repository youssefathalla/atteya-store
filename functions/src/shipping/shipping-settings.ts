import type { DocumentData } from 'firebase-admin/firestore';
import type {
  ShippingBox,
  ShippingBoxId,
  ShippingSettings,
} from '../offers/engine/index.js';
import { SHIPPING_BOX_IDS } from '../offers/engine/index.js';

export const SHIPPING_DOC_PATH = 'settings/shipping';

export const DEFAULT_SHIPPING_NOTE =
  'Shipping fee is paid upfront; the rest is paid on delivery. Delivery in 1\u20134 days.';

/**
 * Placeholder box rates until the client supplies final prices.
 * Egypt ≈ former zone range; abroad ≈ former flat 750 mid-tier.
 */
export const DEFAULT_EGYPT_BOXES: readonly ShippingBox[] = [
  {
    id: 'box1',
    name: 'Box 1',
    maxWeightGrams: 1_000,
    maxLengthCm: 30,
    maxWidthCm: 20,
    maxHeightCm: 10,
    feeEgp: 115,
  },
  {
    id: 'box2',
    name: 'Box 2',
    maxWeightGrams: 5_000,
    maxLengthCm: 45,
    maxWidthCm: 35,
    maxHeightCm: 20,
    feeEgp: 140,
  },
  {
    id: 'box3',
    name: 'Box 3',
    maxWeightGrams: 10_000,
    maxLengthCm: 60,
    maxWidthCm: 45,
    maxHeightCm: 35,
    feeEgp: 180,
  },
];

export const DEFAULT_INTERNATIONAL_BOXES: readonly ShippingBox[] = [
  {
    id: 'box1',
    name: 'Box 1',
    maxWeightGrams: 1_000,
    maxLengthCm: 30,
    maxWidthCm: 20,
    maxHeightCm: 10,
    feeEgp: 450,
  },
  {
    id: 'box2',
    name: 'Box 2',
    maxWeightGrams: 5_000,
    maxLengthCm: 45,
    maxWidthCm: 35,
    maxHeightCm: 20,
    feeEgp: 750,
  },
  {
    id: 'box3',
    name: 'Box 3',
    maxWeightGrams: 10_000,
    maxLengthCm: 60,
    maxWidthCm: 45,
    maxHeightCm: 35,
    feeEgp: 1_100,
  },
];

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  currency: 'EGP',
  egyptBoxes: DEFAULT_EGYPT_BOXES,
  internationalBoxes: DEFAULT_INTERNATIONAL_BOXES,
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
}

/** Firestore-ready seed document (Dates are converted to Timestamps by the SDK). */
export function shippingSeedData(): Record<string, unknown> {
  return {
    currency: 'EGP',
    egyptBoxes: DEFAULT_EGYPT_BOXES.map(cloneBox),
    internationalBoxes: DEFAULT_INTERNATIONAL_BOXES.map(cloneBox),
    freeOver: { ...DEFAULT_SHIPPING_SETTINGS.freeOver },
    promo: { ...DEFAULT_SHIPPING_SETTINGS.promo },
    note: DEFAULT_SHIPPING_SETTINGS.note,
  };
}

export function parseCheckoutShippingConfig(
  data: DocumentData | undefined,
): CheckoutShippingConfig {
  const base = DEFAULT_SHIPPING_SETTINGS;
  if (!data) {
    return { settings: base };
  }
  const egyptBoxes = parseBoxes(data['egyptBoxes']) ?? base.egyptBoxes;
  const internationalBoxes =
    parseBoxes(data['internationalBoxes']) ?? base.internationalBoxes;
  const settings: ShippingSettings = {
    currency: 'EGP',
    egyptBoxes,
    internationalBoxes,
    freeOver: parseFreeOver(data['freeOver']) ?? { ...base.freeOver },
    promo: parsePromo(data['promo']) ?? { ...base.promo },
    note: typeof data['note'] === 'string' ? data['note'] : base.note,
  };
  return { settings };
}

function cloneBox(box: ShippingBox): Record<string, unknown> {
  return {
    id: box.id,
    name: box.name,
    maxWeightGrams: box.maxWeightGrams,
    maxLengthCm: box.maxLengthCm,
    maxWidthCm: box.maxWidthCm,
    maxHeightCm: box.maxHeightCm,
    feeEgp: box.feeEgp,
  };
}

function parseBoxes(raw: unknown): readonly ShippingBox[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const byId = new Map<ShippingBoxId, ShippingBox>();
  for (const entry of raw) {
    const box = parseBox(entry);
    if (!box) continue;
    byId.set(box.id, box);
  }
  const ordered: ShippingBox[] = [];
  for (const id of SHIPPING_BOX_IDS) {
    const box = byId.get(id);
    if (box) ordered.push(box);
  }
  return ordered.length === SHIPPING_BOX_IDS.length ? ordered : null;
}

function parseBox(raw: unknown): ShippingBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = row['id'];
  if (id !== 'box1' && id !== 'box2' && id !== 'box3') return null;
  const name = typeof row['name'] === 'string' && row['name'].trim() ? row['name'].trim() : null;
  const maxWeightGrams = readPositiveInt(row['maxWeightGrams'], 1, 100_000);
  const maxLengthCm = readPositiveInt(row['maxLengthCm'], 1, 300);
  const maxWidthCm = readPositiveInt(row['maxWidthCm'], 1, 300);
  const maxHeightCm = readPositiveInt(row['maxHeightCm'], 1, 300);
  const feeEgp = readFee(row['feeEgp'], -1);
  if (!name || maxWeightGrams === null || maxLengthCm === null || maxWidthCm === null || maxHeightCm === null || feeEgp < 0) {
    return null;
  }
  return {
    id,
    name,
    maxWeightGrams,
    maxLengthCm,
    maxWidthCm,
    maxHeightCm,
    feeEgp,
  };
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

function readPositiveInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}
