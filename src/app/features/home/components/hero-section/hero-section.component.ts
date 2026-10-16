import { Component, computed, input, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HomeHero } from '../../models/home.model';
import { normalizeImageKitPath } from '@shared/utils/image.utils';

@Component({
  selector: 'app-hero-section',
  imports: [RouterLink, NgOptimizedImage],
  templateUrl: './hero-section.component.html',
})
export class HeroSectionComponent {
  readonly hero = input.required<HomeHero>();
  readonly #hasError = signal(false);

  readonly imagePath = computed(() => {
    if (this.#hasError()) {
      return 'hero/default-hero.jpg';
    }
    return normalizeImageKitPath(this.hero().imageUrl) || 'hero/default-hero.jpg';
  });

  handleImageError(): void {
    this.#hasError.set(true);
  }
}
