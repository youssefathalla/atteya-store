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
  MAX_SHOP_LABEL,
  parseWeightGrams,
  previewSlug,
} from '../../utils/catalog-manager.utils';

export interface CategoryDialogData {
  /** Null = Add Category. */
  readonly category: Category | null;
  /** Every category, for the "Inside" list and the address preview. */
  readonly categories: readonly Category[];
  /** Add Category from "Add to Apparel" / Add Inside: "Inside" starts on that category. */
  readonly parentId?: string | null;
}

/** What the window closes with: the save, or `'delete'` when Delete was pressed in Edit. */
export type CategoryDialogResult = CatalogDialogResult | 'delete';

const SIZE_CHART_LABEL: Record<CategorySizeChart, string> = {
  clothing: 'Clothing size chart',
  none: 'No size chart',
};

const DETAILS_TITLE_LABEL: Record<CategoryDetailsTitle, string> = {
  materials: 'Materials',
  specifications: 'Specifications',
};

/**
 * Add or edit one category (ATS-264): Name, Inside, Show in the menu, Shown on the store and a
 * closed More Options section (Size Chart, Details Title, Shipping weight, Name on Shop Tabs,
 * Photo). Saves through `saveCategory` and closes with its result.
 */
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
  readonly #ref = inject<MatDialogRef<CategoryDialogComponent, CategoryDialogResult>>(MatDialogRef);
  readonly #catalog = inject(CatalogAdminService);

  readonly maxName = MAX_CATALOG_NAME;
  readonly maxShopLabel = MAX_SHOP_LABEL;
  readonly isNew = this.#data.category === null;
  readonly title = this.isNew ? 'Add Category' : `Edit ${this.#data.category?.name ?? 'Category'}`;
  readonly saveLabel = this.isNew ? 'Add Category' : 'Save Changes';

  /** Only main categories can hold others (two levels). */
  readonly parentOptions = this.#data.categories
    .filter((item) => item.depth === 0 && item.id !== this.#data.category?.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  readonly name = signal(this.#data.category?.name ?? '');
  readonly parentId = signal<string | null>(
    this.#data.category
      ? this.#data.category.parentId
      : this.parentOptions.some((item) => item.id === this.#data.parentId)
        ? (this.#data.parentId ?? null)
        : null,
  );
  readonly shopLabel = signal(this.#data.category?.shopLabel ?? '');
  readonly image = signal<ImageAsset | null>(this.#data.category?.image ?? null);
  readonly weightText = signal(this.#initialWeight());
  readonly published = signal(this.#data.category?.published ?? true);
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

  /** `/category/caps` or `/category/apparel/caps`: the address the store uses. */
  readonly address = computed(() => {
    if (!this.isNew) return `/category/${this.#data.category?.path ?? ''}`;
    const slug = this.slug();
    if (!slug) return '';
    const parent = this.parent();
    return parent ? `/category/${parent.path}/${slug}` : `/category/${slug}`;
  });

  /** Main categories get a Shop tab; the ones inside them don't. */
  readonly isTopLevel = computed(() =>
    this.isNew ? this.parentId() === null : this.#data.category?.depth === 0,
  );

  readonly parent = computed(() => {
    const id = this.parentId();
    return id ? (this.#data.categories.find((item) => item.id === id) ?? null) : null;
  });

  readonly parentName = computed(() => this.parent()?.name ?? this.parentId() ?? '');

  /** For the menu switch: which menu opens the chosen "Inside" category. */
  readonly menuParent = computed(() => {
    const parent = this.parent();
    return parent ? { id: parent.id, path: parent.path } : null;
  });

  /** What the tab says when "Name on Shop Tabs" is left empty. */
  readonly defaultTabName = computed(() =>
    shopTabLabel({
      id: this.#data.category?.id ?? this.slug(),
      name: this.name().replace(/\s+/g, ' ').trim() || 'the name',
    }),
  );

  /** A main category has nothing to copy, so "Same as" shows as its own default. */
  readonly sizeChart = computed((): CategoryPageChoice<CategorySizeChart> => {
    const choice = this.sizeChartChoice();
    return choice === 'parent' && this.isTopLevel() ? 'none' : choice;
  });

  readonly detailsTitle = computed((): CategoryPageChoice<CategoryDetailsTitle> => {
    const choice = this.detailsTitleChoice();
    return choice === 'parent' && this.isTopLevel() ? 'specifications' : choice;
  });

  /** What "Same as Apparel" means right now, e.g. "Clothing size chart". */
  readonly parentSizeChartLabel = computed(() => {
    const parent = this.parent();
    return SIZE_CHART_LABEL[
      parent ? this.#resolved(categoryPageChoice(parent, 'sizeChart', 'none'), 'none') : 'none'
    ];
  });

  readonly parentDetailsTitleLabel = computed(() => {
    const parent = this.parent();
    return DETAILS_TITLE_LABEL[
      parent
        ? this.#resolved(categoryPageChoice(parent, 'detailsTitle', 'specifications'), 'specifications')
        : 'specifications'
    ];
  });

  /** The line under the closed More Options: "Same as Apparel", "Built-in settings" or the values. */
  readonly moreSummary = computed(() => {
    const weight = this.weightText().trim();
    if (!this.isTopLevel()) {
      if (this.sizeChart() === 'parent' && this.detailsTitle() === 'parent') {
        return `Same as ${this.parentName()}${weight ? ` · ${weight} g` : ''}`;
      }
    } else if (this.#untouchedBuiltIn()) {
      return 'Built-in settings';
    }
    const size = this.sizeChart();
    const title = this.detailsTitle();
    return [
      size === 'parent' ? this.parentSizeChartLabel() : SIZE_CHART_LABEL[size],
      title === 'parent' ? this.parentDetailsTitleLabel() : DETAILS_TITLE_LABEL[title],
      weight ? `${weight} g` : '',
    ]
      .filter(Boolean)
      .join(' · ');
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
    return (event.target as HTMLInputElement).value;
  }

  /** Edit → Delete: the list runs the same checks as the ⋮ menu. */
  requestDelete(): void {
    this.#ref.close('delete');
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
      this.error.set('In More Options, use whole grams from 0 to 100,000 for the weight, or leave it empty.');
      return;
    }
    const shopLabel = this.isTopLevel() ? this.shopLabel().replace(/\s+/g, ' ').trim() : '';
    if (shopLabel.length > MAX_SHOP_LABEL) {
      this.error.set(`Keep the name on Shop tabs to ${MAX_SHOP_LABEL} characters or fewer.`);
      return;
    }
    const image = this.image();
    if (image && image.path && !image.alt.trim()) {
      this.error.set('In More Options, describe the photo in a few words.');
      return;
    }
    const menuId = this.menuId();
    const menuColumn = this.menuColumn();
    const placement = this.isNew && this.addToMenu() ? { menuId, columnIndex: menuColumn } : null;
    if (placement && (placement.menuId === null || placement.columnIndex === null)) {
      this.error.set('Pick a menu and a column, or turn off the menu switch.');
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
        // The window no longer edits the description; a saved one is kept as it is.
        description: this.#data.category?.description ?? '',
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
    const parentPath = this.parent()?.path;
    try {
      await this.#catalog.addToMenu(placement, {
        label: name,
        path: parentPath ? `/category/${parentPath}/${result.id}` : `/category/${result.id}`,
        target: { kind: 'category', id: result.id },
      });
      return result;
    } catch {
      return { ...result, menuFailed: true };
    }
  }

  /** A main category whose More Options nobody has set or changed. */
  #untouchedBuiltIn(): boolean {
    const category = this.#data.category;
    const sameWeight = this.weightText().trim() === this.#initialWeight();
    const sameChoices =
      this.sizeChartChoice() === (category ? categoryPageChoice(category, 'sizeChart', 'none') : 'parent') &&
      this.detailsTitleChoice() ===
        (category ? categoryPageChoice(category, 'detailsTitle', 'specifications') : 'parent');
    const nothingSaved =
      !category ||
      (category.sizeChart === undefined &&
        category.detailsTitle === undefined &&
        category.defaultWeightGrams === undefined);
    return nothingSaved && sameWeight && sameChoices && !this.shopLabel().trim() && !this.image()?.path;
  }

  #resolved<T extends string>(choice: CategoryPageChoice<T>, fallback: T): T {
    return choice === 'parent' ? fallback : choice;
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
