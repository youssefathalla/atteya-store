import { Component, inject, signal } from '@angular/core';
import { form, submit, validate } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormField } from '@angular/forms/signals';
import { PRODUCT_BRANDS, PRODUCT_TYPES } from '@core/services/products/product.constants';
import type { Product } from '@core/services/products/product.model';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import type { ProductEditDraft } from '../../models/product-admin.model';
import { isModelGroup } from '../../utils/product-admin.utils';

export interface ProductEditDialogData {
  readonly product: Product;
  readonly groups: readonly string[];
}

@Component({
  selector: 'app-product-edit-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    FormField,
    SelectInputComponent,
    TextInputComponent,
  ],
  templateUrl: './product-edit-dialog.component.html',
})
export class ProductEditDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<ProductEditDialogComponent, ProductEditDraft | null>);
  readonly data = inject<ProductEditDialogData>(MAT_DIALOG_DATA);

  readonly types = PRODUCT_TYPES;
  readonly brands = PRODUCT_BRANDS;
  readonly groupHint = this.data.groups.length
    ? `Groups already in use: ${this.data.groups.join(', ')}.`
    : 'No model groups yet. Leave this blank if the product stands alone.';

  readonly model = signal({
    type: this.data.product.type,
    brand: this.data.product.brand,
    modelGroup: this.data.product.modelGroup ?? '',
    published: this.data.product.published,
  });

  readonly editForm = form(this.model, (path) => {
    validate(path.modelGroup, ({ value }) => {
      if (isModelGroup(value())) return undefined;
      return { kind: 'modelGroup', message: 'Use lowercase letters, numbers, and hyphens.' };
    });
  });

  onSave(event: Event): void {
    event.preventDefault();
    void submit(this.editForm, async () => {
      const value = this.model();
      const draft: ProductEditDraft = {
        type: value.type,
        brand: value.brand,
        modelGroup: value.modelGroup.trim() || null,
        published: value.published,
      };
      this.#dialogRef.close(draft);
    });
  }
}
