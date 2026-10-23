import { Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavService } from '@core/services/navigation';
import { CatalogService } from '@core/services/products/catalog.service';
import { SeoService } from '@core/services/seo';

@Component({
  selector: 'app-category',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './category.component.html',
  host: {
    class: 'block w-full min-h-[60vh] container-content',
  },
})
export class CategoryComponent {
  readonly slug = input.required<string>();
  readonly subSlug = input<string>();
  readonly isBrand = input<boolean>(false);

  readonly #navService = inject(NavService);
  readonly #catalogService = inject(CatalogService);
  readonly #router = inject(Router);
  readonly #seoService = inject(SeoService);

  constructor() {
    effect(() => {
      const title = this.displayTitle();
      const isBrand = this.isBrandRoute();
      this.#seoService.setPageMetadata({
        title: `${title} | Atteya Store`,
        description: isBrand
          ? `Discover official tournament equipment and performance gear from ${title} at Atteya Store.`
          : `Discover our curated collection of tournament-grade ${title.toLowerCase()} designed for elite padel and tennis players.`,
      });
    });
  }

  readonly isBrandRoute = computed(
    () => this.isBrand() || this.#router.url.startsWith('/brand/'),
  );

  readonly matchedBrand = computed(() => {
    if (!this.isBrandRoute()) return null;
    const s = this.slug().toLowerCase();
    const categories = this.#navService.categories();

    for (const cat of categories) {
      if (!cat.megaMenu) continue;
      for (const col of cat.megaMenu) {
        const link = col.links.find(
          (l) => l.path.toLowerCase() === `/brand/${s}` || l.label.toLowerCase() === s,
        );
        if (link) return link;
      }
    }
    return null;
  });

  readonly category = computed(() => {
    if (this.isBrandRoute()) return null;
    const s = this.slug().toLowerCase();
    return (
      this.#navService
        .categories()
        .find((c) => c.id.toLowerCase() === s || c.path?.toLowerCase() === `/category/${s}`) ?? null
    );
  });

  readonly catalogCategory = computed(() => {
    if (this.isBrandRoute()) return null;
    const targetSlug = (this.subSlug() || this.slug()).toLowerCase();
    return this.#catalogService.categoryBySlug(targetSlug);
  });

  readonly displayTitle = computed(() => {
    if (this.isBrandRoute()) {
      const catalogBrand = this.#catalogService.brandBySlug(this.slug());
      if (catalogBrand) return catalogBrand.name;
      return this.matchedBrand()?.label || this.slug().replaceAll('-', ' ');
    }

    const fromCatalog = this.catalogCategory();
    if (fromCatalog) return fromCatalog.name;

    const sub = this.subSlug();
    if (sub) {
      const cat = this.category();
      if (cat?.megaMenu) {
        for (const col of cat.megaMenu) {
          const match = col.links.find((l) => l.path.toLowerCase().endsWith(`/${sub.toLowerCase()}`));
          if (match) return match.label;
        }
      }
      return sub.replaceAll('-', ' ');
    }
    return this.category()?.label || this.slug().replaceAll('-', ' ');
  });

  readonly currentRoutePath = computed(() => {
    if (this.isBrandRoute()) return `/brand/${this.slug()}`;
    const sub = this.subSlug();
    if (sub) return `/category/${this.slug()}/${sub}`;
    return `/category/${this.slug()}`;
  });

  readonly catalogIcon = computed(() => (this.isBrandRoute() ? 'verified' : 'category'));

  readonly catalogDescription = computed(() =>
    this.isBrandRoute()
      ? 'Products from this brand will automatically populate here.'
      : 'Products assigned to this category will automatically populate here.',
  );
}
