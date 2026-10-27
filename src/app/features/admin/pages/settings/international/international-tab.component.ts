import { isPlatformBrowser } from '@angular/common';
import { Component, computed, effect, inject, PLATFORM_ID, resource, signal, untracked } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import * as v from 'valibot';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { injectFirestore } from '@core/firebase';
import { PublicCurrencySchema } from '@core/services/currency/currency.schema';
import { formatCairoDisplay } from '@core/services/offers/engine';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { IntlConfigSchema, IntlRatesSchema } from './schemas/intl-pricing.schema';
import { InternationalAdminService } from './services/international-admin.service';
import {
  callableMessage,
  markupError,
  ratePreviewRows,
  ratesAreStale,
  toDate,
  type IntlPageData,
} from './utils/rate-preview';

const DEFAULT_MARKUP = 40;

@Component({
  selector: 'app-international-tab',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatProgressSpinnerModule, SharedIconModule, SkeletonComponent],
  templateUrl: './international-tab.component.html',
})
export class InternationalTabComponent {
  readonly #firestore = injectFirestore();
  readonly #platformId = inject(PLATFORM_ID);
  readonly #admin = inject(InternationalAdminService);
  readonly #snackbar = inject(SnackbarService);

  readonly markup = signal(DEFAULT_MARKUP);
  readonly isSaving = signal(false);
  readonly isRefreshing = signal(false);
  #markupDirty = false;

  readonly pageResource = resource({
    loader: async (): Promise<IntlPageData | null> => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const [configSnap, ratesSnap, currencySnap] = await Promise.all([
        getDoc(doc(this.#firestore, 'intlPricing', 'config')),
        getDoc(doc(this.#firestore, 'intlPricing', 'rates')),
        getDoc(doc(this.#firestore, 'settings', 'currency')),
      ]);
      const config = configSnap.exists() ? v.safeParse(IntlConfigSchema, configSnap.data()) : null;
      const rates = ratesSnap.exists() ? v.safeParse(IntlRatesSchema, ratesSnap.data()) : null;
      const published = currencySnap.exists()
        ? v.safeParse(PublicCurrencySchema, currencySnap.data())
        : null;
      const ratesDoc = rates?.success ? rates.output : null;
      return {
        markupPercent: config?.success ? config.output.markupPercent : DEFAULT_MARKUP,
        rates: ratesDoc?.rates ?? {},
        published: published?.success ? published.output.currencies : {},
        fetchedAt: toDate(ratesDoc?.fetchedAt),
        providerUpdatedAt: toDate(ratesDoc?.providerUpdatedAt),
        lastError: ratesDoc?.lastError ?? null,
      };
    },
  });

  readonly rows = computed(() => {
    const page = this.pageResource.value();
    return ratePreviewRows(page?.rates ?? {}, this.markup(), page?.published ?? {});
  });

  readonly updatedLabel = computed(() => cairoLabel(this.pageResource.value()?.fetchedAt ?? null));
  readonly providerLabel = computed(() =>
    cairoLabel(this.pageResource.value()?.providerUpdatedAt ?? null),
  );
  readonly lastError = computed(() => this.pageResource.value()?.lastError ?? null);
  readonly ratesAreOld = computed(() => ratesAreStale(this.pageResource.value()?.fetchedAt ?? null));
  readonly showForm = computed(
    () => !this.pageResource.isLoading() || this.pageResource.hasValue(),
  );

  constructor() {
    effect(() => {
      const page = this.pageResource.value();
      if (!page || this.#markupDirty) return;
      untracked(() => this.markup.set(page.markupPercent));
    });
  }

  onMarkup(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    this.#markupDirty = true;
    this.markup.set(parsed);
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    const error = markupError(this.markup());
    if (error) {
      this.#snackbar.error(error);
      return;
    }
    this.isSaving.set(true);
    try {
      const saved = await this.#admin.saveMarkup(this.markup());
      this.markup.set(saved);
      this.#markupDirty = false;
      this.pageResource.reload();
      this.#snackbar.success('Markup saved.');
    } catch (caught: unknown) {
      this.#snackbar.error(callableMessage(caught, "We couldn't save the markup. Please try again."));
    } finally {
      this.isSaving.set(false);
    }
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing()) return;
    this.isRefreshing.set(true);
    try {
      const result = await this.#admin.refreshRates();
      this.pageResource.reload();
      if (!result.ok) {
        this.#snackbar.error(result.error ?? "We couldn't refresh rates. The last good rates are unchanged.");
        return;
      }
      if (result.warnings.length > 0) {
        this.#snackbar.warning(result.warnings.join(' '));
        return;
      }
      this.#snackbar.success('Exchange rates updated.');
    } catch (caught: unknown) {
      this.#snackbar.error(callableMessage(caught, "We couldn't refresh rates. Please try again."));
    } finally {
      this.isRefreshing.set(false);
    }
  }
}

function cairoLabel(date: Date | null): string {
  const label = formatCairoDisplay(date);
  return label || 'Not yet';
}
