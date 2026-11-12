import { Component, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { PRODUCT_TYPES } from '@core/services/products/product.constants';
import { SharedIconModule } from '@shared/ui/mat-icon';
import type {
  BrandOptionView,
  CategoryFilterOptionView,
  ProductListCounts,
  ProductListView,
} from '../../models/product-admin.model';

@Component({
  selector: 'app-products-toolbar',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    SharedIconModule,
  ],
  templateUrl: './products-toolbar.component.html',
  styleUrl: './products-toolbar.component.css',
})
export class ProductsToolbarComponent {
  readonly search = model('');
  readonly typeId = model('all');
  readonly brandId = model('all');
  /** Category filter (ATS-265): a main category includes the ones inside it. */
  readonly categoryId = model('all');
  readonly view = model<ProductListView>('all');
  readonly counts = input<ProductListCounts>({ all: 0, live: 0, hidden: 0, low: 0, out: 0 });
  readonly countsReady = input(false);
  readonly activity = input<'tools' | null>(null);
  /** Every brand doc (hidden ones marked), from Categories & Brands (`buildBrandOptions()`). */
  readonly brands = input<readonly BrandOptionView[]>([]);
  /** Main categories and the ones inside them, hidden ones marked (`buildCategoryFilterOptions()`). */
  readonly categories = input<readonly CategoryFilterOptionView[]>([]);

  readonly views: readonly { readonly id: ProductListView; readonly label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'live', label: 'Live' },
    { id: 'hidden', label: 'Hidden' },
    { id: 'low', label: 'Low stock' },
    { id: 'out', label: 'Out of stock' },
  ];

  readonly addProduct = output<void>();
  readonly checkCatalog = output<void>();
  readonly removeLegacy = output<void>();
  readonly rebuildSearch = output<void>();
  readonly shippingWeights = output<void>();

  /** Product types are a fixed list (they are not categories). */
  readonly types = PRODUCT_TYPES;

  onSearch(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.search.set(target.value);
  }
}
