import { Component, inject, OnInit } from '@angular/core';
import { HomeService } from './services/home.service';
import { HeroSectionComponent } from './components/hero-section/hero-section.component';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-home',
  imports: [HeroSectionComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  readonly #homeService = inject(HomeService);
  readonly #seoService = inject(SeoService);

  readonly hero = this.#homeService.hero;

  ngOnInit(): void {
    this.#seoService.setPageMetadata({
      title: 'Atteya Store | Premium Padel & Performance Athletic Gear',
      description:
        'Discover performance-grade gear, padel rackets, apparel, and footwear engineered for elite training and court excellence.',
    });
  }
}
