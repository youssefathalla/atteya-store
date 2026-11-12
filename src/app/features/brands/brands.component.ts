import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { NavService } from '@core/services/navigation';
import { SeoService } from '@core/services/seo';

interface BrandCardItem {
  readonly label: string;
  readonly path: string;
}

interface BrandGroup {
  readonly title: string;
  readonly brands: readonly BrandCardItem[];
}

/** Placeholder cards shown while navigation loads (one desktop row). */
const SKELETON_CARDS = [0, 1, 2, 3] as const;

@Component({
  selector: 'app-brands',
  imports: [RouterLink, LinkTargetPipe, MatButtonModule, SharedIconModule, SkeletonComponent],
  templateUrl: './brands.component.html',
  host: {
    class: 'block w-full min-h-[60vh] container-content',
  },
})
export class BrandsComponent implements OnInit {
  readonly #navService = inject(NavService);
  readonly #seoService = inject(SeoService);

  readonly skeletonCards = SKELETON_CARDS;

  ngOnInit(): void {
    this.#seoService.setPageMetadata({
      title: 'Featured Brands | Atteya Store',
      description:
        "Discover our curated collection of tournament-grade equipment, padel rackets, and performance apparel from the world's most prestigious athletic brands.",
    });
  }

  /** Same signal the navbar waits for: navigation and catalogue counts have settled (SSR seed or browser read). */
  readonly isReady = this.#navService.navLinksReady;

  readonly brandGroups = computed<readonly BrandGroup[]>(() => {
    // Every brand of a column that fills itself, not only its "Show at most" (ATS-247).
    const brandsCategory = this.#navService
      .directoryCategories()
      .find((c) => c.id.toLowerCase() === 'brands' || c.path === '/brands');

    return (brandsCategory?.megaMenu ?? [])
      .map((col) => ({
        title: col.title || 'Brands',
        brands: col.links.map((link): BrandCardItem => ({ label: link.label, path: link.path })),
      }))
      .filter((group) => group.brands.length > 0);
  });

  /** Distinct brands, so a brand listed in two columns counts once. */
  readonly totalBrandCount = computed(
    () => new Set(this.brandGroups().flatMap((group) => group.brands.map((brand) => brand.path))).size,
  );

  readonly countLabel = computed(() => {
    const count = this.totalBrandCount();
    return count === 1 ? '1 brand' : `${count} brands`;
  });
}
