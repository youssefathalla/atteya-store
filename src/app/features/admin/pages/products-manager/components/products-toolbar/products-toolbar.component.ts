import { Component, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PRODUCT_BRANDS, PRODUCT_TYPES } from '@core/services/products/product.constants';
import { SharedIconModule } from '@shared/ui/mat-icon';

@Component({
  selector: 'app-products-toolbar',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatMenuModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    SharedIconModule,
  ],
  templateUrl: './products-toolbar.component.html',
})
export class ProductsToolbarComponent {
  readonly search = model('');
  readonly typeId = model('all');
  readonly brandId = model('all');
  readonly activity = input<'preview' | 'import' | 'tools' | null>(null);
  readonly progressLabel = input('');
  readonly progressValue = input(0);

  readonly preview = output<void>();
  readonly importProducts = output<void>();
  readonly checkCatalog = output<void>();
  readonly removeLegacy = output<void>();

  readonly types = PRODUCT_TYPES;
  readonly brands = PRODUCT_BRANDS;

  onSearch(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.search.set(target.value);
  }

  onType(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.typeId.set(target.value);
  }

  onBrand(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.brandId.set(target.value);
  }
}
