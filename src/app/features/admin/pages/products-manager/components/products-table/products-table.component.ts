import { Component, computed, input, output, TemplateRef, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import { TableColumn, PaginationServiceInterface } from '@shared/ui/reusable-table/table.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { StatusBadgeComponent } from '@shared/ui/status-badge/status-badge.component';
import { StatusConfig } from '@shared/ui/status-badge/status.model';
import type { ProductTableRow } from '../../models/product-admin.model';

@Component({
  selector: 'app-products-table',
  host: { class: 'block w-full' },
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    AppImageFallbackDirective,
    TemplateTypeDirective,
    EgpPricePipe,
    ReusableTable,
    SkeletonComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './products-table.component.html',
})
export class ProductsTableComponent {
  readonly rows = input.required<ProductTableRow[]>();
  readonly loading = input(false);
  readonly tableLoading = input(false);
  readonly loadError = input('');
  readonly paginationService = input<PaginationServiceInterface<ProductTableRow>>();
  readonly browseMode = input(true);
  readonly hasActiveFilters = input(false);
  readonly catalogueEmpty = input(false);
  readonly edit = output<string>();
  readonly stock = output<string>();

  private readonly imageCell = viewChild<TemplateRef<unknown>>('imageCell');
  private readonly priceCell = viewChild<TemplateRef<unknown>>('priceCell');
  private readonly stockCell = viewChild<TemplateRef<unknown>>('stockCell');
  private readonly statusCell = viewChild<TemplateRef<unknown>>('statusCell');
  private readonly editCell = viewChild<TemplateRef<unknown>>('editCell');

  readonly sampleRow: ProductTableRow = {
    id: '',
    name: '',
    categoryId: 'rackets',
    categoryLabel: '',
    type: 'rackets',
    typeLabel: '',
    brandId: 'adidas',
    brandLabel: '',
    modelGroup: '',
    price: 0,
    compareAtPrice: null,
    published: false,
    imagePath: null,
    status: 'hidden',
    stock: null,
    stockStatus: 'unset',
  };

  readonly statusConfig: Record<string, StatusConfig> = {
    live: { label: 'Live', color: 'green' },
    hidden: { label: 'Hidden', color: 'gray' },
  };

  readonly stockStatusConfig: Record<string, StatusConfig> = {
    in: { label: 'In stock', color: 'green' },
    out: { label: 'Out of stock', color: 'red' },
    unset: { label: 'Not set', color: 'gray' },
  };

  readonly emptyMessage = computed(() => {
    if (this.catalogueEmpty() && !this.hasActiveFilters()) {
      return 'No products yet. Preview an import to see what would be copied.';
    }
    return 'No products match your filters.';
  });

  readonly columns = computed((): TableColumn<ProductTableRow>[] => {
    const imageCell = this.imageCell();
    const priceCell = this.priceCell();
    const stockCell = this.stockCell();
    const statusCell = this.statusCell();
    const editCell = this.editCell();
    const browse = this.browseMode();
    return [
      { key: 'imagePath', label: 'Photo', sortable: false, customCellTpl: imageCell },
      { key: 'name', label: 'Name', sortable: true },
      {
        key: 'categoryLabel',
        label: 'Category',
        sortable: browse ? false : true,
      },
      { key: 'typeLabel', label: 'Type', sortable: browse ? false : true },
      { key: 'brandLabel', label: 'Brand', sortable: browse ? false : true },
      { key: 'modelGroup', label: 'Model group', sortable: browse ? false : true },
      {
        key: 'price',
        label: 'Price',
        sortable: browse ? false : true,
        customCellTpl: priceCell,
      },
      { key: 'stock', label: 'Stock', sortable: false, customCellTpl: stockCell },
      {
        key: 'status',
        label: 'Status',
        sortable: browse ? false : true,
        customCellTpl: statusCell,
      },
      { key: 'id', label: 'Edit', sortable: false, customCellTpl: editCell },
    ];
  });
}
