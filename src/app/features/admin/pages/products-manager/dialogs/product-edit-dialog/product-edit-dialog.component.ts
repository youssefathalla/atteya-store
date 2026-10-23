import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { categoryIdsFor } from '@core/services/products/catalog-taxonomy';
import { PRODUCT_TYPES } from '@core/services/products/product.constants';
import type { Product } from '@core/services/products/product.model';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import type {
  BrandOptionView,
  CategoryOptionView,
  ProductEditDraft,
} from '../../models/product-admin.model';
import { defaultCategoryForType, isModelGroup } from '../../utils/product-admin.utils';

export interface ProductEditDialogData {
  readonly product: Product;
  readonly groups: readonly string[];
  readonly categories: readonly CategoryOptionView[];
  readonly brands: readonly BrandOptionView[];
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
  readonly categories = this.data.categories;
  readonly brands = this.data.brands;
  readonly groupHint = this.data.groups.length
    ? `Groups already in use: ${this.data.groups.join(', ')}.`
    : 'No model groups yet. Leave this blank if the product stands alone.';

  readonly model = signal({
    type: this.data.product.type,
    categoryId: this.data.product.categoryId,
    brandId: this.data.product.brandId,
    modelGroup: this.data.product.modelGroup ?? '',
    published: this.data.product.published,
  });

  #lastType = this.data.product.type;
  #lastSuggestedCategory = this.data.product.categoryId;
  #categoryPickedInSession = false;

  constructor() {
    effect(() => {
      const current = this.model();
      if (
        current.categoryId !== this.#lastSuggestedCategory &&
        current.type === this.#lastType
      ) {
        this.#categoryPickedInSession = true;
        this.#lastSuggestedCategory = current.categoryId;
      }
      if (current.type !== this.#lastType) {
        this.#lastType = current.type;
        if (!this.#categoryPickedInSession) {
          const suggested = defaultCategoryForType(current.type);
          this.#lastSuggestedCategory = suggested;
          untracked(() => {
            this.model.update((prev) => ({ ...prev, categoryId: suggested }));
          });
        }
      }
    });
  }

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
      const matched = this.categories.find((cat) => cat.id === value.categoryId);
      const categoryIds = matched ? matched.categoryIds : categoryIdsFor(value.categoryId);
      const draft: ProductEditDraft = {
        type: value.type,
        categoryId: value.categoryId,
        categoryIds,
        categoryPicked: this.#categoryPickedInSession,
        brandId: value.brandId,
        modelGroup: value.modelGroup.trim() || null,
        published: value.published,
      };
      this.#dialogRef.close(draft);
    });
  }
}
