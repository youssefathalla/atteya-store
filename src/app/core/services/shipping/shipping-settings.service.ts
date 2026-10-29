import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { doc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { CurrencyService } from '@core/services/currency/currency.service';
import {
  shippingFromFee,
  type ShippingBox,
  type ShippingSettings,
} from '@core/services/offers/engine';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { signalDoc } from '@shared/utils/firebase/firestore-signals';
import {
  DEFAULT_EGYPT_BOXES,
  DEFAULT_INTERNATIONAL_BOXES,
  ShippingSettingsSchema,
  type ShippingSettingsDoc,
} from './shipping-settings.schema';

export function toEngineShipping(docData: ShippingSettingsDoc): ShippingSettings {
  return {
    currency: 'EGP',
    egyptBoxes: normalizeBoxes(docData.egyptBoxes, DEFAULT_EGYPT_BOXES),
    internationalBoxes: normalizeBoxes(docData.internationalBoxes, DEFAULT_INTERNATIONAL_BOXES),
    freeOver: docData.freeOver,
    promo: {
      active: docData.promo.active,
      fee: docData.promo.fee,
      startsAt: toDate(docData.promo.startsAt),
      endsAt: toDate(docData.promo.endsAt),
      minSubtotal: docData.promo.minSubtotal,
      banner: docData.promo.banner,
    },
    note: docData.note,
  };
}

function normalizeBoxes(
  boxes: readonly ShippingBox[] | undefined,
  fallback: readonly ShippingBox[],
): readonly ShippingBox[] {
  if (!boxes || boxes.length !== 3) return fallback.map((box) => ({ ...box }));
  return boxes.map((box) => ({ ...box }));
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object' && 'toDate' in raw && typeof raw.toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

@Service()
export class ShippingSettingsService {
  readonly #firestore = injectFirestore();
  readonly #currency = inject(CurrencyService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);
  readonly #now = signal(new Date());

  readonly #doc = signalDoc(
    doc(this.#firestore, 'settings', 'shipping').withConverter(
      createValibotConverter(ShippingSettingsSchema),
    ),
  );

  readonly settings = computed<ShippingSettings | null>(() => {
    const raw = this.#doc();
    return raw ? toEngineShipping(raw) : null;
  });

  readonly fromFee = computed(() => {
    const settings = this.settings();
    return settings ? shippingFromFee(settings) : null;
  });

  readonly promoLive = computed(() => {
    const promo = this.settings()?.promo;
    if (!promo?.active) return false;
    const nowMs = this.#now().getTime();
    return (
      (!promo.startsAt || nowMs >= promo.startsAt.getTime()) &&
      (!promo.endsAt || nowMs < promo.endsAt.getTime())
    );
  });

  readonly bannerText = computed(() => {
    if (this.#currency.selected() !== 'EGP') return '';
    const settings = this.settings();
    if (!settings) return '';
    if (this.promoLive() && settings.promo.banner) return settings.promo.banner;
    if (settings.freeOver.active && settings.freeOver.threshold !== null) {
      return `Free shipping on orders over EGP ${settings.freeOver.threshold.toLocaleString('en-US')}`;
    }
    return '';
  });

  readonly shippingLine = computed(() => {
    if (this.#currency.selected() !== 'EGP') return '';
    const settings = this.settings();
    const from = this.fromFee();
    if (!settings || from === null) return '';
    const parts = [`Shipping from EGP ${from.toLocaleString('en-US')}`];
    if (settings.freeOver.active && settings.freeOver.threshold !== null) {
      parts.push(`Free over EGP ${settings.freeOver.threshold.toLocaleString('en-US')}`);
    }
    if (settings.note) parts.push(settings.note);
    return parts.join(' \u00b7 ');
  });

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      const id = setInterval(() => this.#now.set(new Date()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(id));
    }
  }
}
