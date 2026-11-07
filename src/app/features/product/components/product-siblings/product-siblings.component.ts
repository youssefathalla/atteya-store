import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { Router } from '@angular/router';
import {
  ProductCacheService,
  type Product,
  type ProductImage,
  ProductService,
} from '@core/services/products';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { normalizeImageKitPath } from '@shared/utils/image';
import { toProductView } from '../../models/product-page.model';
import { isProductInStock } from '../../utils/product-stock.utils';

interface ColourItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly image: ProductImage | null;
  readonly current: boolean;
}

/**
 * Every colour of the same model (`modelGroup`) as small photo links in the details column.
 * The order is fixed for the whole group and the open colour is underlined in its place, so
 * switching colours never reshuffles the row. The group is read once per model: moving between
 * its colours reuses it. A switch keeps the page where it is instead of jumping to the top.
 * Shows nothing until another in-stock colour exists.
 */
@Component({
  selector: 'app-product-siblings',
  imports: [NgOptimizedImage, AppImageFallbackDirective, PrefetchProductDirective],
  templateUrl: './product-siblings.component.html',
  // Holds the placeholder height while loading; collapses (no flex gap) when there is no other colour to show.
  host: { class: 'block w-full empty:hidden' },
})
export class ProductSiblingsComponent {
  readonly modelGroup = input.required<string>();
  /** Id of the open product. */
  readonly currentId = input.required<string>();
  /** Main photo and name of the open product (live, so a photo edit shows here too). */
  readonly currentImage = input<ProductImage | null>(null);
  readonly currentName = input.required<string>();
  readonly currentSlug = input.required<string>();
  /** Line above the photos, e.g. "Colour: Navy". */
  readonly label = input.required<string>();

  readonly #products = inject(ProductService);
  readonly #cache = inject(ProductCacheService);
  readonly #router = inject(Router);

  readonly imagePath = normalizeImageKitPath;

  readonly group = resource({
    params: () => this.modelGroup(),
    loader: ({ params }) =>
      this.#products.listModelGroup(params).then((list) => {
        this.#cache.seed(list);
        return list;
      }),
  });

  readonly items = computed<readonly ColourItem[]>(() => {
    if (!this.group.hasValue()) return [];
    const id = this.currentId();
    const all = this.group.value();
    const others = all.filter((item) => item.id !== id && isProductInStock(toProductView(item)));
    if (others.length === 0) return [];

    const current: ColourItem = {
      id,
      slug: this.currentSlug(),
      name: this.currentName(),
      image: this.currentImage(),
      current: true,
    };
    const toItem = (item: Product): ColourItem => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      image: item.images[0] ?? null,
      current: false,
    });
    // Out-of-stock colours stay hidden, but the open one always keeps its place.
    const list = all
      .filter((item) => item.id === id || others.includes(item))
      .map((item) => (item.id === id ? current : toItem(item)));
    return list.some((item) => item.current) ? list : [current, ...list];
  });

  /** Plain left click: switch colour in place. Other clicks (new tab, etc.) follow the link. */
  open(event: MouseEvent, item: ColourItem): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (item.current) return;
    void this.#router.navigate(['/product', item.slug], { scroll: 'manual' });
  }
}
