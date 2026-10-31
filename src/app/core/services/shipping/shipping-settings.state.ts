import { makeStateKey } from '@angular/core';
import type { ShippingSettingsDoc } from './shipping-settings.schema';

/** JSON-safe shipping settings for TransferState (promo dates as epoch ms). */
export interface ShippingSettingsSeed {
  readonly currency?: 'EGP';
  readonly egyptBoxes: ShippingSettingsDoc['egyptBoxes'];
  readonly internationalBoxes: ShippingSettingsDoc['internationalBoxes'];
  readonly freeOver: NonNullable<ShippingSettingsDoc['freeOver']>;
  readonly promo: {
    readonly active: boolean;
    readonly fee?: number;
    readonly startsAtMs: number | null;
    readonly endsAtMs: number | null;
    readonly minSubtotal: number | null;
    readonly banner: string | null;
  };
  readonly note?: string;
}

export const SHIPPING_SETTINGS_KEY = makeStateKey<ShippingSettingsSeed | null>('shipping-settings');

function timestampToMs(raw: unknown): number | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw.getTime();
  if (
    typeof raw === 'object' &&
    'toDate' in raw &&
    typeof (raw as { toDate: () => Date }).toDate === 'function'
  ) {
    return (raw as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return null;
}

export function toShippingSettingsSeed(doc: ShippingSettingsDoc): ShippingSettingsSeed {
  return {
    currency: doc.currency,
    egyptBoxes: doc.egyptBoxes,
    internationalBoxes: doc.internationalBoxes,
    freeOver: doc.freeOver ?? { active: false, threshold: null },
    promo: {
      active: doc.promo.active,
      fee: doc.promo.fee,
      startsAtMs: timestampToMs(doc.promo.startsAt),
      endsAtMs: timestampToMs(doc.promo.endsAt),
      minSubtotal: doc.promo.minSubtotal,
      banner: doc.promo.banner,
    },
    note: doc.note,
  };
}

export function shippingSeedToDoc(seed: ShippingSettingsSeed): ShippingSettingsDoc {
  return {
    currency: seed.currency ?? 'EGP',
    egyptBoxes: seed.egyptBoxes,
    internationalBoxes: seed.internationalBoxes,
    freeOver: seed.freeOver,
    promo: {
      active: seed.promo.active,
      fee: seed.promo.fee ?? 0,
      startsAt: seed.promo.startsAtMs === null ? null : new Date(seed.promo.startsAtMs),
      endsAt: seed.promo.endsAtMs === null ? null : new Date(seed.promo.endsAtMs),
      minSubtotal: seed.promo.minSubtotal,
      banner: seed.promo.banner,
    },
    note: seed.note ?? '',
  };
}
