import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import { FavoritesService } from '@core/services/favorites';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { ProductCardColorway, ProductCardData } from './product-card.model';
import { visibleColorways } from './product-card.utils';

@Component({
  selector: 'app-product-card',
  host: { class: 'product-card block w-full' },
  imports: [
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    AppImageFallbackDirective,
    PrefetchProductDirective,
    HorizontalScrollDirective,
    ProductPriceComponent,
    SharedIconModule,
  ],
  templateUrl: './product-card.component.html',
})
export class ProductCardComponent {
  readonly product = input.required<ProductCardData>();
  readonly priority = input(false);
  readonly sizes = input('(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw');

  readonly #auth = inject(AuthService);
  readonly #favorites = inject(FavoritesService);
  readonly #router = inject(Router);

  /** Hover preview for a sibling colourway photo (does not change navigation). */
  readonly #preview = signal<ProductCardColorway | null>(null);

  readonly colorwayRow = computed(() => visibleColorways(this.product().colorways));

  readonly displayImagePath = computed(() => {
    const preview = this.#preview();
    if (preview?.imagePath) return preview.imagePath;
    return this.product().imagePath;
  });

  readonly displayImageAlt = computed(() => {
    const preview = this.#preview();
    if (preview) return preview.imageAlt;
    return this.product().imageAlt;
  });

  readonly isFavorite = computed(() => {
    if (!this.#auth.isAuthReady() || !this.#auth.isAuthenticated()) return false;
    if (!this.#favorites.ready()) return false;
    return this.#favorites.has(this.product().id);
  });

  readonly favoriteBusy = computed(() => this.#favorites.isPending(this.product().id));

  readonly favoriteLabel = computed(() =>
    this.isFavorite() ? 'Remove from favorites' : 'Add to favorites',
  );

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  isSelected(colorway: ProductCardColorway): boolean {
    return colorway.productId === this.product().id;
  }

  onColorEnter(colorway: ProductCardColorway): void {
    this.#preview.set(colorway);
  }

  onColorLeave(): void {
    this.#preview.set(null);
  }

  onFavoriteClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.#auth.isAuthReady()) return;

    if (!this.#auth.isAuthenticated()) {
      void this.#router.navigate(['/login'], {
        queryParams: { returnUrl: safeReturnUrl(this.#router.url) },
      });
      return;
    }

    const product = this.product();
    void this.#favorites.toggle(product.id, product.slug);
  }
}
