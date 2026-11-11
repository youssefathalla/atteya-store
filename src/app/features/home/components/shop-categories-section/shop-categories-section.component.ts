import { Component, computed, inject, input, output, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { MatAnchor, MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { normalizeImageKitPath } from '@shared/utils/image';
import { DEFAULT_SHOP_CATEGORY_CARDS, SHOP_CATEGORIES_CARD_COUNT } from '../../data/home.data';
import { HomeShopCategories, ShopCategoryCard } from '../../models/home.model';

@Component({
  selector: 'app-shop-categories-section',
  host: {
    class: 'block w-full',
  },
  templateUrl: './shop-categories-section.component.html',
  imports: [
    RouterLink,
    LinkTargetPipe,
    NgOptimizedImage,
    AppImageFallbackDirective,
    SkeletonComponent,
    SharedIconModule,
    MatAnchor,
    MatButtonModule,
  ],
})
export class ShopCategoriesSectionComponent {
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly shopCategories = input.required<HomeShopCategories>();
  readonly isLoading = input<boolean>(false);
  readonly previewMode = input<boolean>(false);
  readonly activeCardIndex = input<number>(0);

  readonly cardSelect = output<number>();

  readonly visibleCards = computed<readonly ShopCategoryCard[]>(() => {
    const cards = this.shopCategories().cards;
    const result: ShopCategoryCard[] = [];
    for (let i = 0; i < SHOP_CATEGORIES_CARD_COUNT; i++) {
      result.push(cards[i] ?? DEFAULT_SHOP_CATEGORY_CARDS[i] ?? DEFAULT_SHOP_CATEGORY_CARDS[0]);
    }
    return result;
  });

  getCardDisplaySrc(card: ShopCategoryCard): string | null {
    const path = normalizeImageKitPath(card.imageUrl);
    if (!path || path === 'hero/default-hero.jpg') {
      return null;
    }
    return path;
  }

  getCardAriaLabel(index: number, card: ShopCategoryCard, isInteractive: boolean): string | null {
    return isInteractive ? `Select category card ${index + 1} (${card.buttonLabel}) to edit` : null;
  }

  onCardClick(index: number): void {
    if (this.previewMode()) {
      this.cardSelect.emit(index);
    }
  }
}
