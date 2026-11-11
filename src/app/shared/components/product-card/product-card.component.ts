import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth/auth.service';
import { FavoritesGateService, FavoritesService } from '@core/services/favorites';
import { CatalogService } from '@core/services/products/catalog.service';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { PrefetchProductDirective } from '@shared/directives/prefetch-product';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { normalizeImageKitPath } from '@shared/utils/image';
import type { ProductCardColorway, ProductCardData } from './product-card.model';
import { genderCategoryLine, visibleColorways } from './product-card.utils';

interface PhotoLayer {
  readonly path: string;
  readonly alt: string;
  readonly initial: boolean;
}

@Component({
  selector: 'app-product-card',
  host: {
    class: 'product-card block w-full',
    // A badge line makes the details taller, so the photo cap leaves room for it.
    '[class.product-card--badged]': '!!product().marketingBadge',
  },
  imports: [
    NgOptimizedImage,
    RouterLink,
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
  /** Fires when the card opens a product page (photo, name or colour link). */
  readonly productOpen = output<void>();

  readonly #auth = inject(AuthService);
  readonly #favorites = inject(FavoritesService);
  readonly #favoritesGate = inject(FavoritesGateService);
  readonly #catalog = inject(CatalogService);
  readonly #router = inject(Router);

  /** Colour picked by a click or tap; the card shows its photo (and opens it) until another is picked. */
  readonly #preview = signal<ProductCardColorway | null>(null);

  /** Product id of the colour the card shows (its own until another colour is picked). */
  readonly #shownId = computed(() => this.#preview()?.productId ?? this.product().id);

  readonly colorwayRow = computed(() => visibleColorways(this.product().colorways, this.product().id));

  /** "Men – T-shirts & polos" when gender is set, otherwise the short description. */
  readonly secondLine = computed(() => {
    const product = this.product();
    const category = product.categoryId ? this.#catalog.categoryBySlug(product.categoryId) : null;
    return genderCategoryLine(product.gender, category?.name ?? null) ?? product.shortDescription;
  });

  /**
   * The colour the card shows: the photo, the name link and the heart all follow it, so the whole card
   * opens and saves the colour on screen (decided with Youssef, ATS-187). The price stays the card's
   * own: colours of one model share a price in the catalogue, and the product page shows the live one.
   */
  readonly photoSlug = computed(() => this.#preview()?.slug ?? this.product().slug);

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

  /**
   * Photos stacked in the media box: the one shown before (underneath) and the one shown now (on top).
   * When the colour changes, the new photo fades in over the old one once it has downloaded, so the
   * swap is a short crossfade instead of a jump. `initial` marks the card's first photo (the only one
   * that may take `priority`).
   */
  readonly photoLayers = linkedSignal<PhotoLayer | null, readonly PhotoLayer[]>({
    source: computed(() => {
      const path = this.displayImagePath();
      return path ? { path, alt: this.displayImageAlt(), initial: false } : null;
    }),
    computation: (current, previous) => {
      if (!current) return [];
      const top = previous?.value.at(-1);
      if (!previous || !top) return [{ ...current, initial: true }];
      if (top.path === current.path) return previous.value;
      // Picked again before the top photo finished loading: keep the photo underneath it, which is
      // already on screen, so the card never flashes the loading shimmer.
      const base = this.#loadedPaths.has(top.path) ? top : (previous.value[0] ?? top);
      // A photo still mounted keeps its layer (and its `initial` flag), so NgOptimizedImage inputs
      // never change after the image was created.
      const next = previous.value.find((layer) => layer.path === current.path) ?? current;
      return base.path === next.path ? [base] : [base, next];
    },
  });

  /** Photos (by path) that have finished downloading on this card. */
  readonly #loadedPaths = new Set<string>();

  onPhotoLoad(path: string): void {
    this.#loadedPaths.add(path);
    // No fade with reduced motion: the old photo can go as soon as the new one is ready.
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.#dropPhotosUnder(path);
    }
  }

  /** The new photo has faded in: unmount the photo underneath it. */
  onPhotoShown(path: string, event: AnimationEvent): void {
    // Only the fade-in counts (not the loading shimmer).
    if (event.animationName === 'product-card-photo-in') this.#dropPhotosUnder(path);
  }

  #dropPhotosUnder(path: string): void {
    const layers = this.photoLayers();
    const top = layers.at(-1);
    if (layers.length > 1 && top?.path === path) this.photoLayers.set([top]);
  }

  readonly isFavorite = computed(() => {
    if (!this.#auth.isAuthReady() || !this.#auth.isAuthenticated()) return false;
    if (!this.#favorites.ready()) return false;
    return this.#favorites.has(this.#shownId());
  });

  /** Block clicks until the favorites list is loaded (avoids create/delete races). */
  readonly favoriteBusy = computed(() => {
    if (this.#favorites.isPending(this.#shownId())) return true;
    if (this.#auth.isAuthenticated() && !this.#favorites.ready()) return true;
    return false;
  });

  readonly favoriteLabel = computed(() => (this.isFavorite() ? 'Remove from favorites' : 'Add to favorites'));

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  /** Underlined colour: the one shown on the card (the card's own until another is picked). */
  isSelected(colorway: ProductCardColorway): boolean {
    return colorway.productId === this.#shownId();
  }

  /**
   * A click or tap on a colour shows that colour on the card (its photo crossfades in) and keeps it.
   * A click on the colour already shown opens its page. Pointing at a colour changes nothing.
   * Clicks with a modifier key (new tab or window) follow the link as usual.
   */
  onColorClick(event: MouseEvent, colorway: ProductCardColorway): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (this.isSelected(colorway)) {
      this.productOpen.emit();
      void this.#router.navigate(['/product', colorway.slug]);
      return;
    }
    this.#preview.set(colorway.productId === this.product().id ? null : colorway);
  }

  /** Plain clicks on the photo or name open the product here; new-tab clicks leave this page in place. */
  onProductLinkClick(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    this.productOpen.emit();
  }

  onFavoriteClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    // The heart saves the colour the shopper is looking at.
    void this.#favoritesGate.onFavoriteClick(this.#shownId(), this.photoSlug());
  }
}
