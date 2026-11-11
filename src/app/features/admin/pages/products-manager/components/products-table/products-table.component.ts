import { Component, computed, input, output, signal, TemplateRef, viewChild } from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import { TableColumn } from '@shared/ui/reusable-table/table.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import type { ProductGroupRow, ProductStockStatus, ProductTableRow } from '../../models/product-admin.model';

@Component({
  selector: 'app-products-table',
  host: { class: 'block w-full' },
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    AppImageFallbackDirective,
    TemplateTypeDirective,
    EgpPricePipe,
    SharedIconModule,
    ReusableTable,
    SkeletonComponent,
  ],
  templateUrl: './products-table.component.html',
  styleUrl: './products-table.component.css',
})
export class ProductsTableComponent {
  readonly groups = input.required<readonly ProductGroupRow[]>();
  readonly loading = input(false);
  readonly tableLoading = input(false);
  readonly loadError = input('');
  readonly hasActiveFilters = input(false);
  readonly catalogueEmpty = input(false);
  /** Product id: the editor opens on that colour. */
  readonly edit = output<string>();
  readonly stock = output<string>();
  readonly switchingId = input<string | null>(null);
  readonly switchPublished = output<ProductTableRow>();

  readonly #open = signal<ReadonlySet<string>>(new Set());

  private readonly productCell = viewChild<TemplateRef<unknown>>('productCell');
  private readonly coloursCell = viewChild<TemplateRef<unknown>>('coloursCell');
  private readonly categoryCell = viewChild<TemplateRef<unknown>>('categoryCell');
  private readonly priceCell = viewChild<TemplateRef<unknown>>('priceCell');
  private readonly stockCell = viewChild<TemplateRef<unknown>>('stockCell');
  private readonly statusCell = viewChild<TemplateRef<unknown>>('statusCell');
  private readonly actionsCell = viewChild<TemplateRef<unknown>>('actionsCell');

  readonly sampleGroup: ProductGroupRow = {
    id: '',
    anchorId: '',
    name: '',
    categoryLabel: '',
    details: '',
    imagePath: null,
    price: 0,
    priceMax: 0,
    compareAtPrice: null,
    stock: null,
    stockStatus: 'unset',
    liveCount: 0,
    colours: [],
  };

  readonly sampleColour: ProductTableRow = {
    id: '',
    name: '',
    categoryId: '',
    categoryLabel: '',
    type: 'rackets',
    typeLabel: '',
    brandId: '',
    brandLabel: '',
    modelGroup: '',
    price: 0,
    compareAtPrice: null,
    published: false,
    imagePath: null,
    status: 'hidden',
    stock: null,
    stockStatus: 'unset',
    colourLabel: '',
  };

  readonly mutableGroups = computed(() => [...this.groups()]);

  readonly emptyMessage = computed(() => {
    if (this.catalogueEmpty() && !this.hasActiveFilters()) {
      return 'No products yet. Press Add Product to create the first one.';
    }
    return 'No products match your filters.';
  });

  readonly columns = computed((): TableColumn<ProductGroupRow>[] => [
    { key: 'name', label: 'Product', sortable: true, customCellTpl: this.productCell() },
    { key: 'colours', label: 'Colours', sortable: false, customCellTpl: this.coloursCell() },
    { key: 'categoryLabel', label: 'Category', sortable: true, customCellTpl: this.categoryCell() },
    { key: 'price', label: 'Price', sortable: true, customCellTpl: this.priceCell() },
    { key: 'stock', label: 'Stock', sortable: true, customCellTpl: this.stockCell() },
    { key: 'liveCount', label: 'Status', sortable: true, customCellTpl: this.statusCell() },
    { key: 'anchorId', label: '', sortable: false, customCellTpl: this.actionsCell() },
  ]);

  isOpen(row: ProductGroupRow): boolean {
    return row.colours.length > 1 && this.#open().has(row.id);
  }

  toggle(row: ProductGroupRow): void {
    this.#open.update((open) => {
      const next = new Set(open);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  statusLabel(colour: ProductTableRow): string {
    if (this.switchingId() === colour.id) return 'Saving';
    return `${colour.published ? 'Live. Hide' : 'Hidden. Make live'} ${this.colourName(colour)}`;
  }

  colourName(colour: ProductTableRow): string {
    return colour.colourLabel ? `${colour.name}, ${colour.colourLabel}` : colour.name;
  }

  stockLabel(status: ProductStockStatus, stock: number | null): string {
    switch (status) {
      case 'unset':
        return 'Not set';
      case 'out':
        return 'Out of stock';
      case 'low':
        return `Low: ${stock} left`;
      default:
        return `${stock} in stock`;
    }
  }
}
