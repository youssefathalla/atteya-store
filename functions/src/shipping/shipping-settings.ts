import type { ShippingSettings } from '../offers/engine/index.js';

export const SHIPPING_DOC_PATH = 'settings/shipping';

export const DEFAULT_SHIPPING_NOTE =
  'Shipping fee is paid upfront; the rest is paid on delivery. Delivery in 1\u20134 days.';

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
  };
}
