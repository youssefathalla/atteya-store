import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule, type MatChipListboxChange } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Offer } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { OfferCardComponent } from './components/offer-card/offer-card.component';
import {
  OfferGroupDialogComponent,
  type OfferCardActions,
  type OfferGroupDialogData,
} from './dialogs/offer-group-dialog/offer-group-dialog.component';
import {
  affectedProductIds,
  groupOfferCards,
  isUnavailableDeal,
  matchesDealFilter,
  OFFER_DEAL_FILTERS,
  OFFER_LIST_BUCKETS,
  singleOfferCard,
  toOfferCardItem,
  UNAVAILABLE_DEAL_MESSAGE,
  type OfferCardItem,
  type OfferCardView,
  type OfferDealFilter,
  type OfferListBucket,
} from './models/offer-admin.model';
import { ProductsAdminService } from '../products-manager/services/products-admin.service';
import { OffersAdminService } from './services/offers-admin.service';

@Component({
  selector: 'app-offers-manager-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    SharedIconModule,
    SkeletonComponent,
    OfferCardComponent,
  ],
  templateUrl: './offers-manager.page.html',
})
export class OffersManagerPageComponent implements OnInit {
  readonly #offersAdmin = inject(OffersAdminService);
  readonly #productsAdmin = inject(ProductsAdminService);
  readonly #dialog = inject(MatDialog);
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);

  /** The time the cards are worked out for; moves every minute so "Ends in …" and the boxes stay right. */
  readonly #now = signal(new Date());

  readonly buckets = OFFER_LIST_BUCKETS;
  readonly dealFilters = OFFER_DEAL_FILTERS;

  readonly bucket = signal<OfferListBucket>('running');
  readonly dealFilter = signal<OfferDealFilter>('all');
  readonly search = signal('');
  /** Offer ids whose switch or menu action is still saving. */
  readonly #busyIds = signal<ReadonlySet<string>>(new Set());

  readonly dataResource = resource({
    loader: async () => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { offers: [], products: [] };
      }
      const [offers, products] = await Promise.all([
        this.#offersAdmin.listOffers(),
        this.#productsAdmin.listAllProducts(),
      ]);
      return { offers, products };
    },
  });

  readonly #productCount = computed(() => this.dataResource.value()?.products.length ?? 0);

  /** The products each offer reaches, worked out once per load. */
  readonly #reach = computed(() => {
    const data = this.dataResource.value();
    const priced = (data?.products ?? []).map((p) => toPricedProduct(p));
    return new Map((data?.offers ?? []).map((offer) => [offer.id, affectedProductIds(offer, priced)]));
  });

  /** Every offer with its card text. */
  readonly #items = computed<readonly OfferCardItem[]>(() => {
    const offers = this.dataResource.value()?.offers ?? [];
    const reach = this.#reach();
    const now = this.#now();
    return offers.map((offer) => toOfferCardItem(offer, reach.get(offer.id) ?? new Set<string>(), now));
  });

  /** Offers that pass the search box and the deal-type chip (the count boxes count these). */
  readonly #matching = computed(() => {
    const query = this.search().trim().toLowerCase();
    const deal = this.dealFilter();
    return this.#items().filter((item) => {
      if (!matchesDealFilter(item.offer, deal)) return false;
      if (!query) return true;
      return [item.offer.name, item.offer.title, item.offer.code ?? ''].some((text) =>
        text.toLowerCase().includes(query),
      );
    });
  });

  readonly counts = computed(() => {
    const counts: Record<OfferListBucket, number> = { running: 0, later: 0, ended: 0, archived: 0 };
    for (const item of this.#matching()) counts[item.bucket] += 1;
    return counts;
  });

  readonly cards = computed(() =>
    groupOfferCards(
      this.#matching().filter((item) => item.bucket === this.bucket()),
      this.#productCount(),
    ),
  );

  readonly sectionLabel = computed(
    () => OFFER_LIST_BUCKETS.find((item) => item.id === this.bucket())?.label ?? '',
  );

  readonly emptyText = computed(() =>
    this.search().trim() || this.dealFilter() !== 'all'
      ? 'No offers match your search.'
      : this.bucket() === 'running'
        ? 'No offers are running right now. Tap New Offer to start one.'
        : 'No offers in this list.',
  );

  /** The page's actions, shared with Open Group so each offer there works the same way. */
  readonly actions: OfferCardActions = {
    isBusy: (card) => card.items.some((item) => this.#busyIds().has(item.offer.id)),
    switched: (card, event) => void this.setOn(card, event),
    duplicate: (card) => void this.duplicateOffer(card.items[0].offer),
    pauseResume: (card) => void this.pauseResume(card.items[0].offer),
    archive: (card) => void this.toggleArchived(card),
    remove: (card) => void this.deleteArchived(card.items[0].offer),
  };

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      const timer = setInterval(() => this.#now.set(new Date()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(timer));
    }
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Offers | Atteya Admin',
      description: 'Manage store discounts, bundles, and scheduled promotions.',
      noindex: true,
    });
  }

  setDealFilter(event: MatChipListboxChange): void {
    // Tapping the chosen chip again clears the listbox: keep that chip chosen.
    const value = event.value as OfferDealFilter | undefined;
    if (!value) {
      event.source.value = this.dealFilter();
      return;
    }
    this.dealFilter.set(value);
  }

  openGroup(card: OfferCardView): void {
    const ids = card.items.map((item) => item.offer.id);
    const cards = computed(() => {
      const byId = new Map(this.#items().map((item) => [item.offer.id, item]));
      return ids
        .map((id) => byId.get(id))
        .filter((item): item is OfferCardItem => !!item)
        .map((item) => singleOfferCard(item, this.#productCount()));
    });
    this.#dialog.open<OfferGroupDialogComponent, OfferGroupDialogData>(OfferGroupDialogComponent, {
      data: { name: card.name, cards, actions: this.actions },
      width: '760px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: false,
    });
  }

  /** The switch: turns the offer (or every offer in a group) on or off. */
  async setOn(card: OfferCardView, event: MatSlideToggleChange): Promise<void> {
    const on = event.checked;
    const offers = card.items.map((item) => item.offer).filter((offer) => offer.active !== on);
    // Turning on an offer of a hidden deal type isn't allowed (same rule as Resume).
    if (on && offers.some((offer) => isUnavailableDeal(offer.reward, offer.scope))) {
      event.source.checked = card.on;
      this.#snackbar.error(UNAVAILABLE_DEAL_MESSAGE);
      return;
    }
    const ok = await this.#run(offers, (offer) => this.#offersAdmin.setOfferActive(offer.id, on));
    if (!ok) {
      event.source.checked = card.on;
      this.#snackbar.error("We couldn't update this offer.");
      return;
    }
    const many = card.items.length > 1;
    this.#snackbar.success(
      on
        ? many
          ? 'Offers turned on.'
          : 'Offer turned on.'
        : many
          ? 'Offers turned off.'
          : 'Offer turned off.',
    );
  }

  async duplicateOffer(source: Offer): Promise<void> {
    if (isUnavailableDeal(source.reward, source.scope)) {
      this.#snackbar.error(UNAVAILABLE_DEAL_MESSAGE);
      return;
    }
    if (this.#busyIds().has(source.id)) return;
    this.#busyIds.update((set) => new Set([...set, source.id]));
    try {
      const nextId = await this.#offersAdmin.duplicateOffer(source);
      this.#snackbar.success('Offer duplicated as paused.');
      await this.#router.navigate(['/admin/offers', nextId]);
    } catch {
      this.#snackbar.error("We couldn't duplicate this offer.");
    } finally {
      this.#busyIds.update((set) => new Set([...set].filter((id) => id !== source.id)));
    }
  }

  async pauseResume(offer: Offer): Promise<void> {
    // Pausing is always allowed; resuming an offer of a hidden deal type is not.
    if (!offer.active && isUnavailableDeal(offer.reward, offer.scope)) {
      this.#snackbar.error(UNAVAILABLE_DEAL_MESSAGE);
      return;
    }
    const ok = await this.#run([offer], (item) => this.#offersAdmin.setOfferActive(item.id, !item.active));
    if (ok) this.#snackbar.success(offer.active ? 'Offer paused.' : 'Offer resumed.');
    else this.#snackbar.error("We couldn't update this offer.");
  }

  async toggleArchived(card: OfferCardView): Promise<void> {
    const archive = card.bucket !== 'archived';
    const ok = await this.#run(
      card.items.map((item) => item.offer),
      (offer) => this.#offersAdmin.setOfferArchived(offer.id, archive),
    );
    if (!ok) {
      this.#snackbar.error("We couldn't update this offer.");
      return;
    }
    const many = card.items.length > 1;
    this.#snackbar.success(
      archive
        ? many
          ? 'Offers archived.'
          : 'Offer archived.'
        : many
          ? 'Offers restored.'
          : 'Offer restored.',
    );
  }

  async deleteArchived(offer: Offer): Promise<void> {
    if (!offer.archived) return;
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete archived offer',
          message: `Permanently delete "${offer.name}"? This cannot be undone.`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          theme: 'error',
        },
        width: '440px',
      },
    );
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    const ok = await this.#run([offer], (item) => this.#offersAdmin.deleteArchivedOffer(item.id));
    if (ok) this.#snackbar.success('Offer deleted.');
    else this.#snackbar.error("We couldn't delete this offer.");
  }

  /** Runs one save per offer, marks them busy meanwhile, then reloads the list. False when any failed. */
  async #run(offers: readonly Offer[], save: (offer: Offer) => Promise<void>): Promise<boolean> {
    const ids = offers.map((offer) => offer.id);
    this.#busyIds.update((set) => new Set([...set, ...ids]));
    try {
      const results = await Promise.allSettled(offers.map((offer) => save(offer)));
      return results.every((result) => result.status === 'fulfilled');
    } finally {
      this.#busyIds.update((set) => new Set([...set].filter((id) => !ids.includes(id))));
      this.dataResource.reload();
    }
  }
}
