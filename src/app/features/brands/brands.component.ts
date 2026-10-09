import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { NavService } from '@layout/navbar/nav.service';

interface BrandCardItem {
  readonly label: string;
  readonly path: string;
  readonly groupTitle: string;
}

@Component({
  selector: 'app-brands',
  imports: [RouterLink, MatButtonModule, SharedIconModule],
  templateUrl: './brands.component.html',
  host: {
    class: 'block w-full min-h-[60vh] py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto',
  },
})
export class BrandsComponent {
  readonly #navService = inject(NavService);

  readonly brandGroups = computed(() => {
    const brandsCategory = this.#navService
      .categories()
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
          title: 'SPORTSWEAR & FOOTWEAR',
          brands: [
            { label: 'On Cloud', path: '/brand/on-cloud', groupTitle: 'SPORTSWEAR & FOOTWEAR' },
            { label: 'Adidas', path: '/brand/adidas', groupTitle: 'SPORTSWEAR & FOOTWEAR' },
            { label: 'Siux', path: '/brand/siux', groupTitle: 'SPORTSWEAR & FOOTWEAR' },
            { label: 'Puma', path: '/brand/puma', groupTitle: 'SPORTSWEAR & FOOTWEAR' },
          ],
        },
      ];
    }

    return brandsCategory.megaMenu.map((col) => ({
      title: col.title || 'BRANDS',
      brands: col.links.map(
        (link): BrandCardItem => ({
          label: link.label,
          path: link.path,
          groupTitle: col.title || 'BRANDS',
        }),
      ),
    }));
  });

  readonly totalBrandCount = computed(() =>
    this.brandGroups().reduce((acc, grp) => acc + grp.brands.length, 0),
  );
}
