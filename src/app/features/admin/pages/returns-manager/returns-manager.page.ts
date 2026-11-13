import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { SeoService } from '@core/services/seo';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import {
  RETURN_STATUS_CONFIG,
  type ReturnRequestDoc,
  type ReturnStatusFilter,
} from './models/return-admin.model';
import { ReturnsAdminService } from './services/returns-admin.service';
import { returnListRow, type ReturnListRow } from './utils/return-admin.utils';

const FILTER_TABS: readonly { readonly id: ReturnStatusFilter; readonly label: string }[] = [
  { id: 'requested', label: 'Requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'received', label: 'Received' },
  { id: 'refund-sent', label: 'Refund Sent' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
];

interface ReturnsRequest {
  readonly after: QueryDocumentSnapshot<ReturnRequestDoc> | null;
}

interface ReturnsPage {
  readonly request: ReturnsRequest;
  readonly requests: readonly ReturnRequestDoc[];
  readonly next: QueryDocumentSnapshot<ReturnRequestDoc> | null;
}

/**
 * Admin Returns (ATS-293): every return or exchange request, newest first, 20 at a time with Show
 * More Requests, filtered by status. Each row opens `/admin/returns/:id`.
 */
@Component({
  selector: 'app-returns-manager-page',
  host: { class: 'block w-full @container' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    SkeletonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './returns-manager.page.html',
})
export class ReturnsManagerPageComponent implements OnInit {
  readonly #returns = inject(ReturnsAdminService);
  readonly #seo = inject(SeoService);
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly filterTabs = FILTER_TABS;
  readonly statusConfig = RETURN_STATUS_CONFIG;
  readonly statusFilter = signal<ReturnStatusFilter>('requested');
  /** Looks in the requests on screen: refs, name, phone, email. */
  readonly searchText = signal('');

  /** A new tab starts from the newest request again. */
  readonly #request = linkedSignal<ReturnStatusFilter, ReturnsRequest>({
    source: this.statusFilter,
    computation: () => ({ after: null }),
  });

  readonly dataResource = resource({
    params: () => ({ status: this.statusFilter(), request: this.#request() }),
    loader: async ({ params: { status, request } }): Promise<ReturnsPage> => {
      if (!this.#browser) return { request, requests: [], next: null };
      const { requests, next } = await this.#returns.listRequests(status, request.after);
      return { request, requests, next };
    },
  });

  /** Every batch on screen; Show More Requests adds the next one under the others. */
  readonly #pages = linkedSignal<
    { readonly page: ReturnsPage | undefined; readonly request: ReturnsRequest },
    readonly ReturnsPage[]
  >({
    source: () => ({
      page: this.dataResource.hasValue() ? this.dataResource.value() : undefined,
      request: this.#request(),
    }),
    computation: ({ page, request }, previous) => {
      const kept = previous?.value ?? [];
      if (!page || page.request !== request) return request.after === null ? [] : kept;
      if (kept.at(-1)?.request === request) return kept;
      return request.after === null ? [page] : [...kept, page];
    },
  });

  readonly #rows = computed((): readonly ReturnListRow[] => {
    const seen = new Set<string>();
    const rows: ReturnListRow[] = [];
    for (const page of this.#pages()) {
      for (const request of page.requests) {
        if (seen.has(request.id)) continue;
        seen.add(request.id);
        rows.push(returnListRow(request));
      }
    }
    return rows;
  });

  readonly rows = computed(() => {
    const words = this.searchText().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.#rows();
    return words.length ? rows.filter((row) => words.every((word) => row.searchText.includes(word))) : rows;
  });

  readonly #next = computed(() => this.#pages().at(-1)?.next ?? null);
  readonly hasMore = computed(() => this.#next() !== null);
  readonly firstLoading = computed(() => this.dataResource.isLoading() && this.#pages().length === 0);
  readonly moreLoading = computed(() => this.dataResource.isLoading() && this.#pages().length > 0);
  readonly loadErrorMessage = computed((): string | null =>
    this.#pages().length === 0 && this.dataResource.error() != null
      ? "We couldn't load the requests. Refresh the page to try again."
      : null,
  );
  readonly moreErrorMessage = computed((): string | null =>
    this.#pages().length > 0 && this.dataResource.error() != null ? "We couldn't load more requests." : null,
  );

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Returns | Atteya Admin',
      description: 'Return and exchange requests: approve, reject, mark items received and refunds sent.',
      noindex: true,
    });
  }

  setFilter(id: ReturnStatusFilter): void {
    this.statusFilter.set(id);
  }

  showMore(): void {
    const next = this.#next();
    if (!next || this.dataResource.isLoading()) return;
    this.#request.set({ after: next });
  }

  retryLoad(): void {
    this.dataResource.reload();
  }
}
