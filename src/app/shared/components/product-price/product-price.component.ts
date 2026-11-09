import { Component, computed, inject, input } from '@angular/core';
import { CurrencyService } from '@core/services/currency/currency.service';
import { displayDecimals, toDisplayAmount } from '@core/services/offers/engine';
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
  /**
   * `listing` (product cards): bold sale + struck compare-at only —
   * no %/offer badges. Non-sale stays regular weight.
   */
  readonly tone = input<'default' | 'listing'>('default');

  readonly isListing = computed(() => this.tone() === 'listing');

  readonly displayedPrice = computed(() => this.fromPrice() ?? this.price());

  readonly effectiveListPrice = computed(() => {
    const list = this.listPrice();
    if (list === null) return null;
    // Round both sides first. A higher EGP list can land on the same
    // display step, and then the struck-through price would repeat the sale.
    const sale = this.#amount(this.displayedPrice());
    const was = this.#amount(list);
    return was > sale ? list : null;
  });

  readonly priceClass = computed(() => {
    if (!this.isListing()) return 'font-title-sm font-bold!';
    // Sale price bold; ordinary listing price stays regular (card typography).
    return this.effectiveListPrice() !== null ? 'font-body-md font-bold!' : 'font-body-md';
  });

  readonly showFromPrefix = computed(
    () => this.partial() || (this.fromPrice() !== null && this.fromPrice() !== this.price()),
  );

  readonly shownPrice = computed(() => this.#format(this.displayedPrice()));

  readonly shownListPrice = computed(() => {
    const list = this.effectiveListPrice();
    return list === null ? '' : this.#format(list);
  });

  readonly shownBadges = computed(() => {
    // Cards never show offer/% chips — only PDP default tone does.
    if (this.isListing()) return [];
    const badges = this.badges();
    if (this.#currency.entry().code === 'EGP') return badges;
    return badges.filter((badge) => !EGP_AMOUNT.test(badge));
  });

  #amount(egp: number): number {
    return toDisplayAmount(egp, this.#currency.entry());
  }

  #format(egp: number): string {
    const entry = this.#currency.entry();
    return formatMoney(this.#amount(egp), entry.code, displayDecimals(entry.code));
  }
}
