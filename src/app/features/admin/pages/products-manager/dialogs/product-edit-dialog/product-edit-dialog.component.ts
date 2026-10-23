import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  categoryIdsFor,
  COLOR_PALETTE,
  sortColors,
  type ColorId,
} from '@core/services/products/catalog-taxonomy';
import { PRODUCT_TYPES } from '@core/services/products/product.constants';
import type { Product } from '@core/services/products/product.model';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
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

const TAG_PATTERN = /^[a-z0-9-]{1,32}$/;

@Component({
  selector: 'app-product-edit-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    FormField,
    SelectInputComponent,
    TextInputComponent,
    SharedIconModule,
  ],
  templateUrl: './product-edit-dialog.component.html',
})
export class ProductEditDialogComponent {
  readonly #dialogRef = inject(MatDialogRef<ProductEditDialogComponent, ProductEditDraft | null>);
  readonly data = inject<ProductEditDialogData>(MAT_DIALOG_DATA);

  readonly types = PRODUCT_TYPES;
  readonly categories = this.data.categories;
  readonly brands = this.data.brands;
  readonly colorPalette = COLOR_PALETTE;
  readonly groupHint = this.data.groups.length
    ? `Groups already in use: ${this.data.groups.join(', ')}.`
    : 'No model groups yet. Leave this blank if the product stands alone.';

  readonly selectedColors = signal<readonly ColorId[]>(
    sortColors(this.data.product.colors ?? []),
  );
  readonly tags = signal<readonly string[]>([...(this.data.product.tags ?? [])]);
  readonly tagInput = signal('');
  readonly tagError = signal('');

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

  hasColor(colorId: ColorId): boolean {
    return this.selectedColors().includes(colorId);
  }

  toggleColor(colorId: ColorId): void {
    const current = this.selectedColors();
    if (current.includes(colorId)) {
      this.selectedColors.set(current.filter((id) => id !== colorId));
    } else if (current.length < 12) {
      this.selectedColors.set(sortColors([...current, colorId]));
    }
  }

  onTagInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.tagInput.set(target.value);
    this.tagError.set('');
  }

  onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addPendingTag();
    }
  }

  addPendingTag(): void {
    const raw = this.tagInput()
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0);
    if (raw.length === 0) return;

    const next = [...this.tags()];
    for (const candidate of raw) {
      if (!TAG_PATTERN.test(candidate)) {
        this.tagError.set('Tags use lowercase letters, numbers, and hyphens (up to 32 chars).');
        return;
      }
      if (!next.includes(candidate)) {
        if (next.length >= 20) {
          this.tagError.set('You can add up to 20 tags.');
          return;
        }
        next.push(candidate);
      }
    }

    this.tags.set(next);
    this.tagInput.set('');
    this.tagError.set('');
  }

  removeTag(tag: string): void {
    this.tags.update((list) => list.filter((item) => item !== tag));
  }

  onSave(event: Event): void {
    event.preventDefault();
    if (this.tagInput().trim()) {
      this.addPendingTag();
      if (this.tagError()) return;
    }

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
        colors: this.selectedColors(),
        tags: this.tags(),
        published: value.published,
      };
      this.#dialogRef.close(draft);
    });
  }
}
