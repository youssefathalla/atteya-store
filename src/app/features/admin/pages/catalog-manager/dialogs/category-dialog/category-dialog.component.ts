import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  DEFAULT_WEIGHT_GRAMS_BY_CATEGORY,
  type CategoryDetailsTitle,
  type CategorySizeChart,
} from '@core/services/products/catalog-taxonomy';
import type { Category } from '@core/services/products/product.model';
import { shopTabLabel } from '@core/services/products/utils/shop-categories';
import type { ImageAsset } from '@shared/schemas';
import { ImagePickerComponent } from '@shared/ui/image-picker';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import {
  CatalogAdminService,
  type CatalogDialogResult,
  type MenuPlacement,
} from '../../services/catalog-admin.service';
import { MenuPlacementComponent } from '../../components/menu-placement/menu-placement.component';
import {
  categoryPageChoice,
  type CategoryPageChoice,
  MAX_CATALOG_NAME,
  MAX_CATEGORY_DESCRIPTION,
  MAX_SHOP_LABEL,
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
    MenuPlacementComponent,
  ],
  templateUrl: './category-dialog.component.html',
})
export class CategoryDialogComponent {
  readonly #data = inject<CategoryDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<CategoryDialogComponent, CatalogDialogResult>>(MatDialogRef);
  readonly #catalog = inject(CatalogAdminService);

  readonly maxName = MAX_CATALOG_NAME;
  readonly maxDescription = MAX_CATEGORY_DESCRIPTION;
  readonly maxShopLabel = MAX_SHOP_LABEL;
  readonly isNew = this.#data.category === null;
  readonly title = this.isNew ? 'Add Category' : `Edit ${this.#data.category?.name ?? 'Category'}`;
  readonly saveLabel = this.isNew ? 'Add Category' : 'Save Changes';

  readonly name = signal(this.#data.category?.name ?? '');
  readonly parentId = signal<string | null>(this.#data.category?.parentId ?? null);
  readonly description = signal(this.#data.category?.description ?? '');
  readonly shopLabel = signal(this.#data.category?.shopLabel ?? '');
  readonly image = signal<ImageAsset | null>(this.#data.category?.image ?? null);
  readonly weightText = signal(this.#initialWeight());
  readonly published = signal(this.#data.category?.published ?? false);
  readonly sizeChartChoice = signal<CategoryPageChoice<CategorySizeChart>>(
    this.#data.category ? categoryPageChoice(this.#data.category, 'sizeChart', 'none') : 'parent',
  );
  readonly detailsTitleChoice = signal<CategoryPageChoice<CategoryDetailsTitle>>(
    this.#data.category
      ? categoryPageChoice(this.#data.category, 'detailsTitle', 'specifications')
      : 'parent',
  );
  readonly addToMenu = signal(false);
  readonly menuId = signal<string | null>(null);
  readonly menuColumn = signal<number | null>(null);
  readonly isSaving = signal(false);
  readonly error = signal('');

  /** Only top-level categories can hold sub-categories (two levels). */
  readonly parentOptions = this.#data.categories
    .filter((item) => item.depth === 0 && item.id !== this.#data.category?.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  /** `/category/caps` or `/category/apparel/caps`: the canonical address the store uses. */
  readonly address = computed(() => {
    if (!this.isNew) return `/category/${this.#data.category?.path ?? ''}`;
    const slug = this.slug();
    if (!slug) return '';
    const parent = this.#data.categories.find((item) => item.id === this.parentId());
    return parent ? `/category/${parent.path}/${slug}` : `/category/${slug}`;
  });

  /** Top-level categories get a Shop tab; sub-categories don't. */
  readonly isTopLevel = computed(() =>
    this.isNew ? this.parentId() === null : this.#data.category?.depth === 0,
  );

  /** What the tab says when "Name on Shop Tabs" is left empty. */
  readonly defaultTabName = computed(() =>
    shopTabLabel({
      id: this.#data.category?.id ?? this.slug(),
      name: this.name().replace(/\s+/g, ' ').trim() || 'the name',
    }),
  );

  /** A top-level category has no parent to copy, so "Same as parent" shows as its own default. */
  readonly sizeChart = computed((): CategoryPageChoice<CategorySizeChart> => {
    const choice = this.sizeChartChoice();
    return choice === 'parent' && this.isTopLevel() ? 'none' : choice;
  });

  readonly detailsTitle = computed((): CategoryPageChoice<CategoryDetailsTitle> => {
    const choice = this.detailsTitleChoice();
    return choice === 'parent' && this.isTopLevel() ? 'specifications' : choice;
  });

  /** What "Same as parent" means right now, e.g. "Clothing size chart". */
  readonly parentSizeChartLabel = computed(() => {
    const parent = this.#parent();
    const value = parent ? categoryPageChoice(parent, 'sizeChart', 'none') : 'none';
    return value === 'clothing' ? 'Clothing size chart' : 'None';
  });

  readonly parentDetailsTitleLabel = computed(() => {
    const parent = this.#parent();
    const value = parent ? categoryPageChoice(parent, 'detailsTitle', 'specifications') : 'specifications';
    return value === 'materials' ? 'Materials' : 'Specifications';
  });

  readonly #parent = computed(() => {
    const id = this.isNew ? this.parentId() : (this.#data.category?.parentId ?? null);
    return id ? (this.#data.categories.find((item) => item.id === id) ?? null) : null;
  });

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
    const shopLabel = this.isTopLevel() ? this.shopLabel().replace(/\s+/g, ' ').trim() : '';
    if (shopLabel.length > MAX_SHOP_LABEL) {
      this.error.set(`Keep the name on Shop tabs to ${MAX_SHOP_LABEL} characters or fewer.`);
      return;
    }
    const image = this.image();
    if (image && image.path && !image.alt.trim()) {
      this.error.set('Describe the photo in a few words.');
      return;
    }
    const menuId = this.menuId();
    const menuColumn = this.menuColumn();
    const placement = this.isNew && this.addToMenu() ? { menuId, columnIndex: menuColumn } : null;
    if (placement && (placement.menuId === null || placement.columnIndex === null)) {
      this.error.set('Pick a menu and a column, or turn off Add to the Menu.');
      return;
    }

    const sizeChart = this.sizeChart();
    const detailsTitle = this.detailsTitle();

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
        shopLabel,
        sizeChart: sizeChart === 'parent' ? null : sizeChart,
        detailsTitle: detailsTitle === 'parent' ? null : detailsTitle,
        published: this.published(),
      });
      this.#ref.close(
        placement?.menuId != null && placement.columnIndex !== null
          ? await this.#addToMenu(result, name, {
              menuId: placement.menuId,
              columnIndex: placement.columnIndex,
            })
          : result,
      );
    } catch (error: unknown) {
      this.error.set(callableMessage(error) ?? "We couldn't save the category. Please try again.");
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Adds the new category's link after it is saved; a failure keeps the category (ATS-248). */
  async #addToMenu(
    result: CatalogDialogResult,
    name: string,
    placement: MenuPlacement,
  ): Promise<CatalogDialogResult> {
    const parentPath = this.#parent()?.path;
    try {
      await this.#catalog.addToMenu(placement, {
        label: name,
        path: parentPath ? `/category/${parentPath}/${result.id}` : `/category/${result.id}`,
        target: { kind: 'category', id: result.id },
      });
      return { ...result, menuAdded: true };
    } catch {
      return { ...result, menuFailed: true };
    }
  }

  /** The saved weight, else the built-in one this category uses today, so the field never looks empty by mistake. */
  #initialWeight(): string {
    const category = this.#data.category;
    if (!category) return '';
    const saved = category.defaultWeightGrams;
    if (saved === null) return '';
    if (typeof saved === 'number') return String(saved);
    const builtIn = DEFAULT_WEIGHT_GRAMS_BY_CATEGORY[category.id];
    return typeof builtIn === 'number' ? String(builtIn) : '';
  }
}
