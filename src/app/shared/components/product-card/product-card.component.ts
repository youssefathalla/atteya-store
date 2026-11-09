import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
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
  /** Fires when the card opens a product page (photo, name or colour link). */
  readonly productOpen = output<void>();

  readonly #auth = inject(AuthService);
  readonly #favorites = inject(FavoritesService);
  readonly #favoritesGate = inject(FavoritesGateService);
  readonly #catalog = inject(CatalogService);
  readonly #router = inject(Router);

  /**
   * Colour whose photo the card shows instead of its own: while the mouse rests on it
   * (desktop), or after a tap (phone), when the photo also opens that colour.
   */
  readonly #preview = signal<ProductCardColorway | null>(null);
  /** Colour picked by a tap; its preview stays until another colour is tapped. */
  #tappedId: string | null = null;
  /** Pointer type of the last press on a colour ('mouse', 'touch' or 'pen'). */
  #pointerType = 'mouse';

  readonly colorwayRow = computed(() => visibleColorways(this.product().colorways, this.product().id));

  /** "Men – T-shirts & polos" when gender is set, otherwise the short description. */
  readonly secondLine = computed(() => {
    const product = this.product();
    const category = product.categoryId ? this.#catalog.categoryBySlug(product.categoryId) : null;
    return genderCategoryLine(product.gender, category?.name ?? null) ?? product.shortDescription;
  });

  /** The photo opens the colour it shows. */
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

  readonly isFavorite = computed(() => {
    if (!this.#auth.isAuthReady() || !this.#auth.isAuthenticated()) return false;
    if (!this.#favorites.ready()) return false;
    return this.#favorites.has(this.product().id);
  });

  /** Block clicks until the favorites list is loaded (avoids create/delete races). */
  readonly favoriteBusy = computed(() => {
    if (this.#favorites.isPending(this.product().id)) return true;
    if (this.#auth.isAuthenticated() && !this.#favorites.ready()) return true;
    return false;
  });

  readonly favoriteLabel = computed(() => (this.isFavorite() ? 'Remove from favorites' : 'Add to favorites'));

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  /** Underlined colour: the one shown on the card (the card's own until another is picked). */
  isSelected(colorway: ProductCardColorway): boolean {
    return colorway.productId === (this.#preview()?.productId ?? this.product().id);
  }

  onColorPointerDown(event: PointerEvent): void {
    this.#pointerType = event.pointerType || 'mouse';
  }

  onColorEnter(colorway: ProductCardColorway): void {
    // Touch browsers also fire mouseenter/focus on a tap; only a real mouse or keyboard previews here.
    if (this.#tappedId !== null || this.#pointerType !== 'mouse') return;
    this.#preview.set(colorway.productId === this.product().id ? null : colorway);
  }

  onColorLeave(): void {
    if (this.#tappedId !== null || this.#pointerType !== 'mouse') return;
    this.#preview.set(null);
  }

  /**
   * Mouse or keyboard: open that colour. Touch: the first tap shows that colour's photo on the
   * card, a second tap on it (or a tap on the photo) opens it. Other clicks (new tab) follow the link.
   */
  onColorClick(event: MouseEvent, colorway: ProductCardColorway): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const touch = this.#pointerType !== 'mouse';
    this.#pointerType = 'mouse';
    if (touch) {
      const isOwn = colorway.productId === this.product().id;
      if (isOwn && this.#tappedId !== null) {
        this.#tappedId = null;
        this.#preview.set(null);
        return;
      }
      if (!isOwn && this.#tappedId !== colorway.productId) {
        this.#tappedId = colorway.productId;
        this.#preview.set(colorway);
        return;
      }
    }
    this.productOpen.emit();
    void this.#router.navigate(['/product', colorway.slug]);
  }

  /** Plain clicks on the photo or name open the product here; new-tab clicks leave this page in place. */
  onProductLinkClick(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    this.productOpen.emit();
  }

  onFavoriteClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const product = this.product();
    void this.#favoritesGate.onFavoriteClick(product.id, product.slug);
  }
}
