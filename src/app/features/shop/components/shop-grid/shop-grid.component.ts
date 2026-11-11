import { Component, computed, inject, input } from '@angular/core';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import type { SearchHit } from '@core/services/search';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import type { ProductCardPrice } from '@shared/components/product-card/product-card.model';
import { searchHitCardPrice, searchHitToCardData } from '@shared/components/product-card/product-card.utils';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { injectFirstRowCount } from '@shared/utils/first-row.utils';

@Component({
  selector: 'app-shop-grid',
  host: { class: 'block w-full' },
  imports: [ProductCardComponent, SkeletonComponent],
  templateUrl: './shop-grid.component.html',
})
export class ShopGridComponent {
  readonly hits = input.required<readonly SearchHit[]>();
  readonly loading = input(false);
  readonly hydrated = input(false);
  readonly nowMs = input(Date.now());

  readonly skeletonSlots = [0, 1, 2, 3, 4, 5] as const;
  /** Photos that load first: one row (2 phone, 3 from tablet up), matching `.shop-product-grid`. */
  readonly firstRow = injectFirstRowCount({ base: 2, md: 3 });

  readonly #offers = inject(OffersService);
  readonly #auth = inject(AuthService);

  readonly cardPrices = computed<ReadonlyMap<string, ProductCardPrice>>(() => {
    const hits = this.hits();
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : [];
    const ctx = {
      now: new Date(this.nowMs()),
      signedIn: this.hydrated() && this.#auth.offerSignedIn(),
    };

    const map = new Map<string, ProductCardPrice>();
    for (const hit of hits) {
      map.set(hit.objectID, searchHitCardPrice(hit, liveMode ? offers : null, ctx));
    }
    return map;
  });

  readonly cards = computed(() => {
    const prices = this.cardPrices();
    return this.hits().flatMap((hit) => {
      const price = prices.get(hit.objectID);
      if (!price) return [];
      return [searchHitToCardData(hit, price)];
    });
  });
}
