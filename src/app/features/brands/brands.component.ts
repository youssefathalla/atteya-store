import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavService } from '@core/services/navigation';
import { SeoService } from '@core/services/seo';

interface BrandCardItem {
  readonly label: string;
  readonly path: string;
  readonly groupTitle: string;
}

@Component({
  selector: 'app-brands',
  imports: [RouterLink, LinkTargetPipe, MatButtonModule, SharedIconModule],
  templateUrl: './brands.component.html',
  host: {
    class: 'block w-full min-h-[60vh] container-content',
  },
})
export class BrandsComponent implements OnInit {
  readonly #navService = inject(NavService);
  readonly #seoService = inject(SeoService);

  ngOnInit(): void {
    this.#seoService.setPageMetadata({
      title: 'Featured Brands | Atteya Store',
      description:
        "Discover our curated collection of tournament-grade equipment, padel rackets, and performance apparel from the world's most prestigious athletic brands.",
    });
  }

  readonly brandGroups = computed(() => {
    const brandsCategory = this.#navService
      .storefrontCategories()
      .find((c) => c.id.toLowerCase() === 'brands' || c.path === '/brands');

    if (!brandsCategory?.megaMenu || brandsCategory.megaMenu.length === 0) {
      return [
        {
          title: 'TOP PADEL BRANDS',
          brands: [
            { label: 'Bullpadel', path: '/brand/bullpadel', groupTitle: 'TOP PADEL BRANDS' },
            { label: 'Nox Padel', path: '/brand/nox', groupTitle: 'TOP PADEL BRANDS' },
            { label: 'Babolat', path: '/brand/babolat', groupTitle: 'TOP PADEL BRANDS' },
            { label: 'Head Padel', path: '/brand/head', groupTitle: 'TOP PADEL BRANDS' },
          ],
        },
        {
          title: 'SPORTSWEAR',
          brands: [
            { label: 'On Cloud', path: '/brand/on-cloud', groupTitle: 'SPORTSWEAR' },
            { label: 'Adidas', path: '/brand/adidas', groupTitle: 'SPORTSWEAR' },
            { label: 'Siux', path: '/brand/siux', groupTitle: 'SPORTSWEAR' },
          ],
        },
      ];
    }

    return brandsCategory.megaMenu.map((col) => ({
      title: col.title || 'BRANDS',
      brands: col.links.map((link): BrandCardItem => ({
        label: link.label,
        path: link.path,
        groupTitle: col.title || 'BRANDS',
      })),
    }));
  });

  readonly totalBrandCount = computed(() =>
    this.brandGroups().reduce((acc, grp) => acc + grp.brands.length, 0),
  );
}
