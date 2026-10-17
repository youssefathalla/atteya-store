import { Component, computed, input, output } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { HeroSlide, HomeHero } from '../../models/home.model';
import { DEFAULT_HERO_SLIDES } from '../../data/home.data';
import { normalizeImageKitPath } from '@shared/utils/image';
import { MatAnchor, MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-hero-section',
  imports: [
    RouterLink,
    NgOptimizedImage,
    AppImageFallbackDirective,
    SharedIconModule,
    MatAnchor,
    MatButtonModule,
  ],
  templateUrl: './hero-section.component.html',
  styleUrl: './hero-section.component.scss',
})
export class HeroSectionComponent {
  readonly hero = input.required<HomeHero>();
  readonly previewMode = input<boolean>(false);
  readonly activeSlotIndex = input<number>(0);

  readonly slotSelect = output<number>();

  readonly visibleSlides = computed<readonly HeroSlide[]>(() => {
    const { layoutCount, slides } = this.hero();
    const result: HeroSlide[] = [];
    for (let i = 0; i < layoutCount; i++) {
      result.push(slides[i] ?? DEFAULT_HERO_SLIDES[i] ?? DEFAULT_HERO_SLIDES[0]);
    }
    return result;
  });

  getSlideDisplaySrc(slide: HeroSlide): string | null {
    const path = normalizeImageKitPath(slide.imageUrl);
    if (!path || path === 'hero/default-hero.jpg') {
      return null;
    }
    return path;
  }

  onBannerClick(index: number): void {
    if (this.previewMode()) {
      this.slotSelect.emit(index);
    }
  }
}
