import {
  Component,
  computed,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { HeroSlide, HomeHero } from '../../models/home.model';
import { DEFAULT_HERO_SLIDES } from '../../data/home.data';
import { normalizeImageKitPath } from '@shared/utils/image';
import { MatAnchor, MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-hero-section',
  templateUrl: './hero-section.component.html',
  styleUrl: './hero-section.component.scss',
  imports: [
    RouterLink,
    NgOptimizedImage,
    AppImageFallbackDirective,
    SkeletonComponent,
    SharedIconModule,
    MatAnchor,
    MatButtonModule,
  ],
})
export class HeroSectionComponent {
  readonly #platformId = inject(PLATFORM_ID);

  readonly hero = input.required<HomeHero>();
  readonly isLoading = input<boolean>(false);
  readonly previewMode = input<boolean>(false);
  readonly activeSlotIndex = input<number>(0);

  readonly slotSelect = output<number>();

  /** Tracks indices of hero banner images that have completed loading or failed over */
  readonly #loadedImages = signal<Set<number>>(new Set());

  readonly visibleSlides = computed<readonly HeroSlide[]>(() => {
    const { layoutCount, slides } = this.hero();
    const result: HeroSlide[] = [];
    for (let i = 0; i < layoutCount; i++) {
      result.push(slides[i] ?? DEFAULT_HERO_SLIDES[i] ?? DEFAULT_HERO_SLIDES[0]);
    }
    return result;
  });

  /**
   * Card-level loading check:
   * Returns false during SSR so prerendered HTML contains full semantic content and headings.
   * In browser, verifies that the image has loaded before removing the shimmer veil.
   */
  isCardLoading(index: number, imgSrc: string | null): boolean {
    if (!isPlatformBrowser(this.#platformId)) return false;
    if (this.isLoading()) return true;
    if (!imgSrc) return false;
    return !this.#loadedImages().has(index);
  }

  onImageLoaded(index: number): void {
    this.#loadedImages.update((current) => {
      const next = new Set(current);
      next.add(index);
      return next;
    });
  }

  onImageFailed(index: number): void {
    this.#loadedImages.update((current) => {
      const next = new Set(current);
      next.add(index);
      return next;
    });
  }

  getSlideDisplaySrc(slide: HeroSlide): string | null {
    const path = normalizeImageKitPath(slide.imageUrl);
    if (!path || path === 'hero/default-hero.jpg') {
      return null;
    }
    return path;
  }

  getSlotAriaLabel(index: number, isInteractive: boolean): string | null {
    return isInteractive ? `Select banner slot ${index + 1} to edit` : null;
  }

  onBannerClick(index: number): void {
    if (this.previewMode()) {
      this.slotSelect.emit(index);
    }
  }
}
