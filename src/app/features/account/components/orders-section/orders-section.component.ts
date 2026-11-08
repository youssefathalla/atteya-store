import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { of } from 'rxjs';
import { ShopperOrdersService, type ShopperOrderRow } from '@core/services/orders/shopper-orders.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

const PAGE_SIZE = 20;

/**
 * Account → Orders: the shopper's orders, newest first, read live. Each row opens the order's
 * status page (`/checkout/confirmation/:orderId`). "Show More Orders" reads 20 more.
 */
@Component({
  selector: 'app-orders-section',
  host: { class: 'block w-full account-section' },
  imports: [RouterLink, MatButtonModule, SharedIconModule, SkeletonComponent],
  templateUrl: './orders-section.component.html',
})
export class OrdersSectionComponent {
  readonly #orders = inject(ShopperOrdersService);

  readonly uid = input.required<string>();

  readonly #max = signal(PAGE_SIZE);
  readonly skeletonRows = [0, 1, 2] as const;

  readonly ordersResource = rxResource({
    params: () => (this.uid() ? { uid: this.uid(), max: this.#max() } : undefined),
    stream: ({ params }) => (params ? this.#orders.watch(params.uid, params.max) : of([])),
  });

  /** Keeps the list on screen while "Show More Orders" reads the longer list. */
  readonly rows = linkedSignal<readonly ShopperOrderRow[] | undefined, readonly ShopperOrderRow[]>({
    source: () => (this.ordersResource.hasValue() ? this.ordersResource.value() : undefined),
    computation: (next, previous) => next ?? previous?.value ?? [],
  });
  readonly showLoading = computed(
    () => this.ordersResource.isLoading() && !this.ordersResource.hasValue() && this.rows().length === 0,
  );
  readonly canShowMore = computed(() => this.rows().length >= this.#max());

  showMore(): void {
    this.#max.update((max) => max + PAGE_SIZE);
  }
}
