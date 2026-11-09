import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import type { TableColumn } from '@shared/ui/reusable-table/table.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import type { StatusConfig } from '@shared/ui/status-badge/status.model';
import { ProductsAdminService } from '../products-manager/services/products-admin.service';
import { toOfferTableRow, type OfferStatusFilter, type OfferTableRow } from './models/offer-admin.model';
import { OffersAdminService } from './services/offers-admin.service';

const FILTER_TABS: readonly { readonly id: OfferStatusFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'ended', label: 'Ended' },
  { id: 'archived', label: 'Archived' },
];

@Component({
  selector: 'app-offers-manager-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatMenuModule,
    SharedIconModule,
    TemplateTypeDirective,
    ReusableTable,
    SkeletonComponent,
    StatusBadgeComponent,
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

  readonly statusFilter = signal<OfferStatusFilter>('all');
  readonly filterTabs = FILTER_TABS;

  private readonly titleCell = viewChild<TemplateRef<unknown>>('titleCell');
  private readonly statusCell = viewChild<TemplateRef<unknown>>('statusCell');
  private readonly actionsCell = viewChild<TemplateRef<unknown>>('actionsCell');

  readonly sampleRow: OfferTableRow = {
    id: '',
    name: '',
    title: '',
    status: 'live',
    rewardSummary: '',
    matchSummary: '',
    datesSummary: '',
    priority: 0,
    active: true,
    archived: false,
    code: null,
  };

  readonly statusConfig: Record<string, StatusConfig> = {
    live: { label: 'Live', color: 'green' },
    scheduled: { label: 'Scheduled', color: 'blue' },
    ended: { label: 'Ended', color: 'gray' },
    paused: { label: 'Paused', color: 'yellow' },
    archived: { label: 'Archived', color: 'gray' },
  };

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

  readonly rows = computed<OfferTableRow[]>(() => {
    const data = this.dataResource.value();
    const offers = data?.offers ?? [];
    const priced = (data?.products ?? []).map((p) => toPricedProduct(p));
    const now = new Date();
    const filter = this.statusFilter();

    return offers
      .map((offer) => toOfferTableRow(offer, priced, now))
      .filter((row) => {
        if (filter === 'archived') return row.archived;
        if (row.archived) return false;
        if (filter === 'all') return true;
        return row.status === filter;
      });
  });

  readonly columns = computed((): TableColumn<OfferTableRow>[] => [
    { key: 'status', label: 'Status', sortable: true, customCellTpl: this.statusCell() },
    { key: 'title', label: 'Offer', sortable: true, customCellTpl: this.titleCell() },
    { key: 'rewardSummary', label: 'Reward', sortable: false },
    { key: 'matchSummary', label: 'Matches', sortable: false },
    { key: 'datesSummary', label: 'Dates (Cairo)', sortable: false },
    { key: 'priority', label: 'Priority', sortable: true },
    { key: 'id', label: 'Actions', sortable: false, customCellTpl: this.actionsCell() },
  ]);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Offers | Atteya Admin',
      description: 'Manage store discounts, bundles, and scheduled promotions.',
      noindex: true,
    });
  }

  async duplicateOffer(id: string): Promise<void> {
    const source = this.dataResource.value()?.offers.find((item) => item.id === id);
    if (!source) return;
    try {
      const nextId = await this.#offersAdmin.duplicateOffer(source);
      this.#snackbar.success('Offer duplicated as paused.');
      await this.#router.navigate(['/admin/offers', nextId]);
    } catch {
      this.#snackbar.error("We couldn't duplicate this offer.");
    }
  }

  async toggleActive(row: OfferTableRow): Promise<void> {
    try {
      await this.#offersAdmin.setOfferActive(row.id, !row.active);
      this.#snackbar.success(row.active ? 'Offer paused.' : 'Offer resumed.');
      this.dataResource.reload();
    } catch {
      this.#snackbar.error("We couldn't update this offer.");
    }
  }

  async toggleArchived(row: OfferTableRow): Promise<void> {
    try {
      await this.#offersAdmin.setOfferArchived(row.id, !row.archived);
      this.#snackbar.success(row.archived ? 'Offer restored.' : 'Offer archived.');
      this.dataResource.reload();
    } catch {
      this.#snackbar.error("We couldn't update this offer.");
    }
  }

  async deleteArchived(row: OfferTableRow): Promise<void> {
    if (!row.archived) return;
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete archived offer',
          message: `Permanently delete "${row.name}"? This cannot be undone.`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          theme: 'error',
        },
        width: '440px',
      },
    );
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    try {
      await this.#offersAdmin.deleteArchivedOffer(row.id);
      this.#snackbar.success('Offer deleted.');
      this.dataResource.reload();
    } catch {
      this.#snackbar.error("We couldn't delete this offer.");
    }
  }
}
