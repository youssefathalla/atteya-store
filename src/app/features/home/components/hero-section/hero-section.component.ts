import {
  Component,
  computed,
  inject,
  input,
  output,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { HeroSlide, HomeHero } from '../../models/home.model';
import { DEFAULT_HERO_SLIDES } from '../../data/home.data';
import { normalizeImageKitPath } from '@shared/utils/image';
import { MatAnchor, MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-hero-section',
  host: {
    class: 'block w-full',
  },
  templateUrl: './hero-section.component.html',
  styleUrl: './hero-section.component.scss',
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
export class HeroSectionComponent {
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly hero = input.required<HomeHero>();
  readonly isLoading = input<boolean>(false);
  readonly previewMode = input<boolean>(false);
  readonly activeSlotIndex = input<number>(0);

  readonly slotSelect = output<number>();

  readonly imageSizes = computed(() => {
    switch (this.hero().layoutCount) {
      case 2:
        return '(max-width: 767px) 90vw, 50vw';
      case 3:
        return '(max-width: 767px) 90vw, (max-width: 1279px) 46vw, 33vw';
      default:
        return '100vw';
    }
  });

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

  getSlotAriaLabel(index: number, isInteractive: boolean): string | null {
    return isInteractive ? `Select banner slot ${index + 1} to edit` : null;
  }

  onBannerClick(index: number): void {
    if (this.previewMode()) {
      this.slotSelect.emit(index);
    }
  }
}
