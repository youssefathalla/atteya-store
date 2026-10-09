import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavService } from '@layout/navbar/nav.service';

@Component({
  selector: 'app-category',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './category.component.html',
  host: {
    class: 'block w-full min-h-[60vh] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto',
  },
})
export class CategoryComponent {
  readonly slug = input.required<string>();
  readonly subSlug = input<string>();

  readonly #navService = inject(NavService);
  readonly #router = inject(Router);

  readonly isBrandRoute = computed(() => this.#router.url.startsWith('/brand/'));

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

  readonly displayTitle = computed(() => {
    if (this.isBrandRoute()) {
      return this.matchedBrand()?.label || this.slug().replaceAll('-', ' ');
    }

    const sub = this.subSlug();
    if (sub) {
      // Look for a link label matching the sub-slug
      const cat = this.category();
      if (cat?.megaMenu) {
        for (const col of cat.megaMenu) {
          const match = col.links.find(
            (l) => l.path.toLowerCase().endsWith(`/${sub.toLowerCase()}`),
          );
          if (match) return match.label;
        }
      }
      return sub.replaceAll('-', ' ');
    }
    return this.category()?.label || this.slug();
  });

  readonly currentRoutePath = computed(() => {
    if (this.isBrandRoute()) {
      return `/brand/${this.slug()}`;
    }
    const sub = this.subSlug();
    return `/category/${this.slug()}${sub ? `/${sub}` : ''}`;
  });

  readonly catalogIcon = computed(() => (this.isBrandRoute() ? 'verified' : 'category'));

  readonly catalogDescription = computed(() =>
    this.isBrandRoute()
      ? 'Products from this brand will automatically populate here.'
      : 'Products assigned to this category will automatically populate here.',
  );
}
