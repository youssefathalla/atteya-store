import { Component, computed, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { HomeHero } from '../../models/home-manager.model';
import { normalizeImageKitPath } from '@shared/utils/image.utils';

@Component({
  selector: 'app-home-hero-preview',
  imports: [NgOptimizedImage],
  templateUrl: './home-hero-preview.component.html',
})
export class HomeHeroPreviewComponent {
  readonly hero = input.required<HomeHero>();
  readonly imagePath = computed(() => normalizeImageKitPath(this.hero().imageUrl));
}
