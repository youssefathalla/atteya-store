import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { SeoService } from '@core/services/seo';
import {
  formatCairoDateTimeInput,
  parseCairoDateTimeInput,
} from '@core/services/offers/engine';
import { ShippingSettingsSchema } from '@core/services/shipping/shipping-settings.schema';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';

interface ZoneDraft {
  id: string;
  name: string;
  fee: number;
  governorates: string[];
}

interface ShippingDraft {
  baseFee: number;
  internationalShippingFeeEgp: number;
  zones: ZoneDraft[];
  freeOverActive: boolean;
  freeOverThreshold: number | null;
  promoActive: boolean;
  promoFee: number;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
  promoMinSubtotal: number | null;
  promoBanner: string;
  note: string;
}

const EMPTY_DRAFT: ShippingDraft = {
  baseFee: 125,
  internationalShippingFeeEgp: 750,
  zones: [],
  freeOverActive: false,
  freeOverThreshold: null,
  promoActive: false,
  promoFee: 0,
  promoStartsAt: null,
  promoEndsAt: null,
  promoMinSubtotal: null,
  promoBanner: '',
  note: '',
};

function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object' && 'toDate' in raw && typeof (raw as { toDate: () => unknown }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

@Component({
  selector: 'app-shipping-tab',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './shipping-tab.component.html',
})
export class ShippingTabComponent implements OnInit {
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #snackbar = inject(SnackbarService);
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Shipping | Atteya Admin',
      description: 'Delivery fees, free shipping, and promotions for Egypt.',
      noindex: true,
    });
  }

  readonly draft = signal<ShippingDraft>(EMPTY_DRAFT);
  readonly isSaving = signal(false);
  readonly formatInput = formatCairoDateTimeInput;

  readonly settingsResource = resource({
    loader: async () => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const ref = doc(this.#firestore, 'settings', 'shipping').withConverter(
        createValibotConverter(ShippingSettingsSchema),
      );
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
  });

  constructor() {
    effect(() => {
      const data = this.settingsResource.value();
      if (!data) return;
      untracked(() =>
        this.draft.set({
          baseFee: data.baseFee,
          internationalShippingFeeEgp: data.internationalShippingFeeEgp ?? 750,
          zones: data.zones.map((zone) => ({ ...zone, governorates: [...zone.governorates] })),
          freeOverActive: data.freeOver.active,
          freeOverThreshold: data.freeOver.threshold,
          promoActive: data.promo.active,
          promoFee: data.promo.fee,
          promoStartsAt: toDate(data.promo.startsAt),
          promoEndsAt: toDate(data.promo.endsAt),
          promoMinSubtotal: data.promo.minSubtotal,
          promoBanner: data.promo.banner ?? '',
          note: data.note,
        }),
      );
    });
  }

  numberFrom(event: Event): number | null {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  textFrom(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  patch(change: Partial<ShippingDraft>): void {
    this.draft.update((prev) => ({ ...prev, ...change }));
  }

  setZoneFee(index: number, event: Event): void {
    const fee = this.numberFrom(event) ?? 0;
    this.draft.update((prev) => ({
      ...prev,
      zones: prev.zones.map((zone, i) => (i === index ? { ...zone, fee } : zone)),
    }));
  }

  dateFrom(event: Event, endOfDay: boolean): Date | null {
    return parseCairoDateTimeInput((event.target as HTMLInputElement).value, endOfDay);
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    const d = this.draft();
    if (d.baseFee > 2000 || d.zones.some((zone) => zone.fee > 2000)) {
      this.#snackbar.error('Shipping fees can be up to EGP 2,000.');
      return;
    }
    if (d.internationalShippingFeeEgp > 1_000_000) {
      this.#snackbar.error('International shipping fee is too high.');
      return;
    }
    if (d.freeOverActive && !d.freeOverThreshold) {
      this.#snackbar.error('Enter the order amount that unlocks free shipping.');
      return;
    }
    if (d.promoStartsAt && d.promoEndsAt && d.promoEndsAt <= d.promoStartsAt) {
      this.#snackbar.error('The promotion must end after it starts.');
      return;
    }

    this.isSaving.set(true);
    try {
      await setDoc(
        doc(this.#firestore, 'settings', 'shipping'),
        {
          currency: 'EGP',
          baseFee: d.baseFee,
          internationalShippingFeeEgp: d.internationalShippingFeeEgp,
          zones: d.zones,
          freeOver: {
            active: d.freeOverActive,
            threshold: d.freeOverThreshold,
          },
          promo: {
            active: d.promoActive,
            fee: d.promoFee,
            startsAt: d.promoStartsAt ? Timestamp.fromDate(d.promoStartsAt) : null,
            endsAt: d.promoEndsAt ? Timestamp.fromDate(d.promoEndsAt) : null,
            minSubtotal: d.promoMinSubtotal,
            banner: d.promoBanner.trim() || null,
          },
          note: d.note.trim(),
          updatedAt: serverTimestamp(),
          updatedBy: this.#auth.user()?.uid ?? 'admin',
        },
        { merge: true },
      );
      this.#snackbar.success('Shipping settings saved.');
    } catch {
      this.#snackbar.error("We couldn't save shipping settings. Please try again.");
    } finally {
      this.isSaving.set(false);
    }
  }
}
