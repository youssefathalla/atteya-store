import { Component, inject, input, linkedSignal, OnInit } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Router } from '@angular/router';
import { SeoService } from '@core/services/seo';
import { BrandsTabComponent } from './components/brands-tab/brands-tab.component';
import { CategoriesTabComponent } from './components/categories-tab/categories-tab.component';

type CatalogTab = 'categories' | 'brands';

/**
 * Admin Categories & Brands (ATS-245): add, rename, reorder, show, hide and delete the
 * categories, sub-categories and brands the store already reads (`categories/{id}`,
 * `brands/{id}`). `?tab=brands` opens the Brands tab.
 */
@Component({
  selector: 'app-catalog-manager-page',
  host: { class: 'block w-full' },
  imports: [MatButtonToggleModule, CategoriesTabComponent, BrandsTabComponent],
  templateUrl: './catalog-manager.page.html',
})
export class CatalogManagerPageComponent implements OnInit {
  readonly #seo = inject(SeoService);
  readonly #router = inject(Router);

  /** Query param `tab`. */
  readonly tab = input<string>();
  readonly activeTab = linkedSignal<CatalogTab>(() => (this.tab() === 'brands' ? 'brands' : 'categories'));

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Categories & Brands | Atteya Admin',
      description: 'Add, rename, reorder, show and hide categories and brands.',
      noindex: true,
    });
  }

  select(tab: CatalogTab): void {
    this.activeTab.set(tab);
    void this.#router.navigate([], {
      queryParams: { tab: tab === 'brands' ? 'brands' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
