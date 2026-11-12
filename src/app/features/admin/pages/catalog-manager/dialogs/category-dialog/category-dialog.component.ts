import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { Category } from '@core/services/products/product.model';
import type { ImageAsset } from '@shared/schemas';
import { ImagePickerComponent } from '@shared/ui/image-picker';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import { CatalogAdminService, type SaveResult } from '../../services/catalog-admin.service';
import {
  MAX_CATALOG_NAME,
  MAX_CATEGORY_DESCRIPTION,
  parseWeightGrams,
  previewSlug,
} from '../../utils/catalog-manager.utils';

export interface CategoryDialogData {
  /** Null = Add Category. */
  readonly category: Category | null;
  /** Every category, for the parent list and the address preview. */
  readonly categories: readonly Category[];
}

/** Add or edit one category. Saves through `saveCategory` and closes with its result. */
@Component({
  selector: 'app-category-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    ImagePickerComponent,
  ],
  templateUrl: './category-dialog.component.html',
})
export class CategoryDialogComponent {
  readonly #data = inject<CategoryDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<CategoryDialogComponent, SaveResult>>(MatDialogRef);
  readonly #catalog = inject(CatalogAdminService);

  readonly maxName = MAX_CATALOG_NAME;
  readonly maxDescription = MAX_CATEGORY_DESCRIPTION;
  readonly isNew = this.#data.category === null;
  readonly title = this.isNew ? 'Add Category' : `Edit ${this.#data.category?.name ?? 'Category'}`;
  readonly saveLabel = this.isNew ? 'Add Category' : 'Save Changes';

  readonly name = signal(this.#data.category?.name ?? '');
  readonly parentId = signal<string | null>(this.#data.category?.parentId ?? null);
  readonly description = signal(this.#data.category?.description ?? '');
  readonly image = signal<ImageAsset | null>(this.#data.category?.image ?? null);
  readonly weightText = signal(this.#initialWeight());
  readonly published = signal(this.#data.category?.published ?? false);
  readonly isSaving = signal(false);
  readonly error = signal('');

  /** Only top-level categories can hold sub-categories (two levels). */
  readonly parentOptions = this.#data.categories
    .filter((item) => item.depth === 0 && item.id !== this.#data.category?.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  readonly parentName = computed(() => {
    const id = this.parentId();
    return id ? (this.#data.categories.find((item) => item.id === id)?.name ?? id) : 'None (top level)';
  });

  readonly slug = computed(() =>
    this.isNew
      ? previewSlug(
          this.name(),
          'categories',
          this.#data.categories.map((item) => item.id),
        )
      : (this.#data.category?.slug ?? ''),
  );

  /** The photo goes in `categories/<id>`; before the first save, the address it will get. */
  readonly photoFolder = computed(() => `categories/${this.slug() || 'new'}` as const);

  readonly weightError = computed(() =>
    parseWeightGrams(this.weightText()) === undefined ? 'Use whole grams from 0 to 100,000.' : '',
  );

  textFrom(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    const name = this.name().replace(/\s+/g, ' ').trim();
    if (!name) {
      this.error.set('Enter a name for the category.');
      return;
    }
    if (this.isNew && !this.slug()) {
      this.error.set('Use at least one letter or number in the name.');
      return;
    }
    const weight = parseWeightGrams(this.weightText());
    if (weight === undefined) {
      this.error.set('Use whole grams from 0 to 100,000 for the weight, or leave it empty.');
      return;
    }
    const image = this.image();
    if (image && image.path && !image.alt.trim()) {
      this.error.set('Describe the photo in a few words.');
      return;
    }

    this.error.set('');
    this.isSaving.set(true);
    try {
      const weightChanged = this.weightText().trim() !== this.#initialWeight();
      const result = await this.#catalog.saveCategory({
        id: this.#data.category?.id ?? null,
        name,
        parentId: this.isNew ? this.parentId() : null,
        description: this.description().trim(),
        image: image && image.path ? image : null,
        // Untouched: leave the saved or built-in default alone.
        ...(weightChanged ? { defaultWeightGrams: weight } : {}),
        published: this.published(),
      });
      this.#ref.close(result);
    } catch (error: unknown) {
      this.error.set(callableMessage(error) ?? "We couldn't save the category. Please try again.");
    } finally {
      this.isSaving.set(false);
    }
  }

  #initialWeight(): string {
    const saved = this.#data.category?.defaultWeightGrams;
    return typeof saved === 'number' ? String(saved) : '';
  }
}
