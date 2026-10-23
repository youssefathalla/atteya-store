import { Component, computed, input, output, TemplateRef, viewChild } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import { TableColumn } from '@shared/ui/reusable-table/table.model';
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
  readonly loadError = input('');
  readonly edit = output<string>();

  private readonly imageCell = viewChild<TemplateRef<unknown>>('imageCell');
  private readonly priceCell = viewChild<TemplateRef<unknown>>('priceCell');
  private readonly statusCell = viewChild<TemplateRef<unknown>>('statusCell');
  private readonly editCell = viewChild<TemplateRef<unknown>>('editCell');

  readonly sampleRow: ProductTableRow = {
    id: '',
    name: '',
    type: 'rackets',
    typeLabel: '',
    brand: 'adidas',
    brandLabel: '',
    modelGroup: '',
    price: 0,
    compareAtPrice: null,
    published: false,
    imagePath: null,
    status: 'hidden',
  };

  readonly statusConfig: Record<string, StatusConfig> = {
    live: { label: 'Live', color: 'green' },
    hidden: { label: 'Hidden', color: 'gray' },
  };

  readonly columns = computed((): TableColumn<ProductTableRow>[] => {
    const imageCell = this.imageCell();
    const priceCell = this.priceCell();
    const statusCell = this.statusCell();
    const editCell = this.editCell();
    return [
      { key: 'imagePath', label: 'Photo', sortable: false, customCellTpl: imageCell },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'typeLabel', label: 'Type', sortable: true },
      { key: 'brandLabel', label: 'Brand', sortable: true },
      { key: 'modelGroup', label: 'Model group', sortable: true },
      { key: 'price', label: 'Price', sortable: true, customCellTpl: priceCell },
      { key: 'status', label: 'Status', sortable: true, customCellTpl: statusCell },
      { key: 'id', label: 'Edit', sortable: false, customCellTpl: editCell },
    ];
  });
}
