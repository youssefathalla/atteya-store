import { Component, inject, OnInit } from '@angular/core';
import { HomeService } from './services/home.service';
import { HeroSectionComponent } from './components/hero-section/hero-section.component';
import { ShopCategoriesSectionComponent } from './components/shop-categories-section/shop-categories-section.component';
import { PadelCarouselSectionComponent } from './components/padel-carousel-section/padel-carousel-section.component';
import { NewArrivalsSectionComponent } from './components/new-arrivals-section/new-arrivals-section.component';
import { NavigationListSectionComponent } from './components/navigation-list-section/navigation-list-section.component';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-home',
  host: {
    class: 'block w-full',
  },
  imports: [
    HeroSectionComponent,
    ShopCategoriesSectionComponent,
    PadelCarouselSectionComponent,
    NewArrivalsSectionComponent,
    NavigationListSectionComponent,
    SkeletonComponent,
  ],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  readonly #homeService = inject(HomeService);
  readonly #seoService = inject(SeoService);

  readonly hero = this.#homeService.hero;
  readonly shopCategories = this.#homeService.shopCategories;
  readonly navList = this.#homeService.navList;
  readonly isLoading = this.#homeService.isLoading;

  ngOnInit(): void {
    this.#seoService.setPageMetadata({
      title: 'Atteya Store | Premium Padel & Performance Athletic Gear',
      description:
        'Discover performance-grade gear, padel rackets, and apparel engineered for elite training and court excellence.',
    });
  }
}
