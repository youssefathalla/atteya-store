import { Component, computed, input, output, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { HeroSlide, HomeHero } from '../../models/home.model';
import { DEFAULT_HERO_SLIDES } from '../../data/home.data';
import { getFirebaseStorageUrl, normalizeImageKitPath } from '@shared/utils/image.utils';
import { MatAnchor, MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-hero-section',
  imports: [RouterLink, NgOptimizedImage, SharedIconModule, MatAnchor, MatButtonModule],
  templateUrl: './hero-section.component.html',
  styleUrl: './hero-section.component.scss',
})
export class HeroSectionComponent {
  readonly hero = input.required<HomeHero>();
  readonly previewMode = input<boolean>(false);
  readonly activeSlotIndex = input<number>(0);

  readonly slotSelect = output<number>();

  readonly #fallbackUrls = signal<ReadonlyMap<number, string>>(new Map());

  readonly visibleSlides = computed<readonly HeroSlide[]>(() => {
    const { layoutCount, slides } = this.hero();
    const result: HeroSlide[] = [];
    for (let i = 0; i < layoutCount; i++) {
      result.push(slides[i] ?? DEFAULT_HERO_SLIDES[i] ?? DEFAULT_HERO_SLIDES[0]);
    }
    return result;
  });

  getSlideDisplaySrc(slide: HeroSlide, index: number): string | null {
    const fallback = this.#fallbackUrls().get(index);
    if (fallback) return fallback;

    const path = normalizeImageKitPath(slide.imageUrl);
    if (!path || path === 'hero/default-hero.jpg') {
      return null;
    }
    return path;
  }

  isDirectFallback(index: number): boolean {
    return this.#fallbackUrls().has(index);
  }

  handleImageError(slide: HeroSlide, index: number): void {
    const path = normalizeImageKitPath(slide.imageUrl);
    if (!path || this.#fallbackUrls().has(index)) return;

    // Failover immediately to direct Firebase Cloud Storage URL
    const directUrl = getFirebaseStorageUrl(path);
    this.#fallbackUrls.update((prev) => {
      const next = new Map(prev);
      next.set(index, directUrl);
      return next;
    });
  }

  onBannerClick(index: number): void {
    if (this.previewMode()) {
      this.slotSelect.emit(index);
    }
  }
}
