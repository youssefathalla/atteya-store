import { Component, computed, inject, input } from '@angular/core';
import { CurrencyService } from '@core/services/currency/currency.service';
import { toDisplayAmount } from '@core/services/offers/engine';
import { formatMoney } from '@shared/utils/money';

const EGP_AMOUNT = /\bEGP\b/;

@Component({
  selector: 'app-product-price',
  host: { class: 'block w-full' },
  templateUrl: './product-price.component.html',
})
export class ProductPriceComponent {
  readonly #currency = inject(CurrencyService);

  readonly price = input.required<number>();
  readonly listPrice = input<number | null>(null);
  readonly fromPrice = input<number | null>(null);
  readonly partial = input(false);
  readonly badges = input<readonly string[]>([]);

  readonly displayedPrice = computed(() => this.fromPrice() ?? this.price());

  readonly effectiveListPrice = computed(() => {
    const list = this.listPrice();
    if (list !== null && list > this.displayedPrice()) {
      return list;
    }
    return null;
  });

  readonly showFromPrefix = computed(
    () =>
      this.partial() ||
      (this.fromPrice() !== null && this.fromPrice() !== this.price()),
  );

  readonly shownPrice = computed(() => this.#format(this.displayedPrice()));

  readonly shownListPrice = computed(() => {
    const list = this.effectiveListPrice();
    return list === null ? '' : this.#format(list);
  });

  readonly shownBadges = computed(() => {
    const badges = this.badges();
    if (this.#currency.entry().code === 'EGP') return badges;
    return badges.filter((badge) => !EGP_AMOUNT.test(badge));
  });

  #format(egp: number): string {
    const entry = this.#currency.entry();
    return formatMoney(toDisplayAmount(egp, entry), entry.code, entry.decimals);
  }
}
