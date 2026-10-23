import { Component, computed, input } from '@angular/core';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';

@Component({
  selector: 'app-product-price',
  host: { class: 'block w-full' },
  imports: [EgpPricePipe],
  templateUrl: './product-price.component.html',
})
export class ProductPriceComponent {
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
}
