import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { StorageAssetTracker, StorageUploadService } from '@core/services/storage';
import {
  COLOR_PALETTE,
  defaultWeightGrams,
  sortColors,
  type ColorId,
} from '@core/services/products/catalog-taxonomy';
import {
  MARKETING_BADGE_KINDS,
  MARKETING_BADGE_LABELS,
  MARKETING_BADGE_STYLES,
  type MarketingBadgeKind,
  type MarketingBadgeStyle,
} from '@core/services/products/marketing-badge';
import {
  PRODUCT_GENDERS,
  PRODUCT_TYPES,
  SIZE_ORDER,
} from '@core/services/products/product.constants';
import type { Product, ProductGenderId, ProductTypeId } from '@core/services/products/product.model';
import {
  defaultNewArrivalUntil,
  isActiveNewArrival,
  newArrivalCountdownLabel,
  parseDateInputValue,
  timestampToMs,
  toDateInputValue,
} from '@core/services/products/utils/new-arrival';
import {
  detailLinesFromText,
  MAX_DETAIL_LINE,
  MAX_DETAIL_LINES,
} from '@core/services/products/utils/product-details';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { ImageAsset } from '@shared/schemas';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { TextFieldInputComponent } from '@shared/ui/forms/text-field-input/text-field-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { ImageGalleryEditorComponent } from '@shared/ui/image-gallery-editor';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import type { ImageFolderPath } from '@shared/utils/image';
import type {
  ProductFormPayload,
  ProductSizeDraft,
  ProductSizePayload,
  StockChange,
} from './models/product-admin.model';
import { ProductsAdminService } from './services/products-admin.service';
import { importActionError } from './utils/import-error';
import {
  buildBrandOptions,
  buildLeafCategoryOptions,
  defaultCategoryForType,
  isModelGroup,
} from './utils/product-admin.utils';

const TAG_PATTERN = /^[a-z0-9-]{1,32}$/;
const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
const MAX_PRICE = 1_000_000;
const MAX_COUNT = 100_000;
const MAX_WEIGHT_GRAMS = 100_000;
const STOCK_MESSAGE = 'Stock must be a whole number from 0 to 100,000.';
const WEIGHT_MESSAGE = 'Weight must be a whole number of grams from 0 to 100,000.';

interface EditorFields {
  name: string;
  slug: string;
  summary: string;
  description: string;
  /** One fact per line (materials, racket specs). */
  details: string;
  type: ProductTypeId;
  categoryId: string;
  brandId: string;
  modelGroup: string;
  gender: '' | ProductGenderId;
  price: string;
  compareAtPrice: string;
  published: boolean;
}

const GENDER_OPTIONS: readonly { readonly id: '' | ProductGenderId; readonly label: string }[] = [
  { id: '', label: 'Not set' },
  ...PRODUCT_GENDERS,
];

@Component({
  selector: 'app-product-editor-page',
  host: { class: 'block w-full' },
  imports: [
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    SelectInputComponent,
    TextInputComponent,
    TextFieldInputComponent,
    ImageGalleryEditorComponent,
    ColorSwatchComponent,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './product-editor.page.html',
})
export class ProductEditorPageComponent implements OnInit {
  readonly productId = input<string>();

  readonly #admin = inject(ProductsAdminService);
  readonly #uploads = inject(StorageUploadService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #router = inject(Router);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #tracker = new StorageAssetTracker();

  readonly types = PRODUCT_TYPES;
  readonly genderOptions = GENDER_OPTIONS;
  readonly colorPalette = COLOR_PALETTE;
  readonly quickSizes = SIZE_ORDER.filter((label) =>
    (QUICK_SIZES as readonly string[]).includes(label),
  );

  readonly isSaving = signal(false);
  readonly images = signal<ImageAsset[]>([]);
  readonly selectedColors = signal<readonly ColorId[]>([]);
  readonly tags = signal<readonly string[]>([]);
  readonly tagInput = signal('');
  readonly tagError = signal('');
  readonly marketingBadgeKind = signal<MarketingBadgeKind | ''>('');
  readonly marketingBadgeStyle = signal<MarketingBadgeStyle>('plain');
  /** Local YYYY-MM-DD when flagged; empty when not a new arrival. */
  readonly newArrivalUntilInput = signal('');
  readonly newArrivalError = signal('');
  readonly colorError = signal('');
  readonly marketingBadgeKinds = [
    { id: '', label: 'None' },
    ...MARKETING_BADGE_KINDS.map((kind) => ({
      id: kind,
      label: MARKETING_BADGE_LABELS[kind],
    })),
  ] as const;
  readonly marketingBadgeStyles = MARKETING_BADGE_STYLES.map((style) => ({
    id: style,
    label: style === 'boxed' ? 'Boxed outline' : 'Plain text',
  }));
  readonly sizes = signal<readonly ProductSizeDraft[]>([]);
  readonly sizeInput = signal('');
  readonly sizeError = signal('');
  readonly flatStock = signal('0');
  readonly weight = signal('');
  readonly formError = signal('');
  readonly #saveTried = signal(false);
  readonly #loadedProduct = signal<Product | null>(null);
  readonly #createdId = signal('');
  readonly #ready = signal(false);
  readonly #reloadTick = signal(0);

  readonly model = signal<EditorFields>(emptyFields());

  #lastType: ProductTypeId = PRODUCT_TYPES[0].id;
  #lastSuggestedCategory = defaultCategoryForType(PRODUCT_TYPES[0].id);
  #categoryPicked = false;
  /** Last weight the form filled in from the category ('' = none), so a typed weight is kept. */
  #suggestedWeight = '';
  #descriptionBaseline = '';
  #descriptionTouched = false;
  #hydratedKey = '';
  #hydratedValue: unknown = null;
  #missingNotified = false;

  readonly editorResource = resource({
    params: () => ({ productId: this.productId() ?? null, tick: this.#reloadTick() }),
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { product: null, categories: [], brands: [], groups: [] as readonly string[] };
      }
      const [product, categories, brands] = await Promise.all([
        params.productId ? this.#admin.getProduct(params.productId) : Promise.resolve(null),
        this.#admin.listAllCategories(),
        this.#admin.listAllBrands(),
      ]);
      let groups: readonly string[];
      try {
        groups = await this.#admin.listModelGroups();
      } catch {
        groups = [];
      }
      return { product, categories, brands, groups };
    },
  });

  readonly showForm = computed(() => this.#ready() && !this.editorResource.error());
  readonly isCreate = computed(() => !this.productId());
  readonly pageHeading = computed(() => (this.isCreate() ? 'Add product' : 'Edit product'));
  readonly activeId = computed(() => this.productId() ?? this.#createdId());
  readonly photoFolder = computed((): ImageFolderPath => `products/${this.activeId()}`);
  readonly categoryOptions = computed(() =>
    buildLeafCategoryOptions(this.editorResource.value()?.categories ?? []),
  );
  readonly brandOptions = computed(() =>
    buildBrandOptions(this.editorResource.value()?.brands ?? []),
  );
  readonly groupHint = computed(() => {
    const groups = this.editorResource.value()?.groups ?? [];
    return groups.length
      ? `Groups already in use: ${groups.join(', ')}.`
      : 'No model groups yet. Leave this blank if the product stands alone.';
  });
  readonly savedSlug = computed(() => this.#loadedProduct()?.slug ?? '');
  readonly easyOrdersDescription = computed(() => {
    const product = this.#loadedProduct();
    return product?.source?.system === 'easyorders' && !!product.descriptionHtml;
  });
  readonly hadSizes = computed(() => hasSizeOption(this.#loadedProduct()));
  readonly sizeEditorDisabled = computed(() => {
    const product = this.#loadedProduct();
    return hasSizeOption(product) && product?.stockBySize === undefined;
  });
  readonly showFlatStock = computed(() => this.isCreate() && this.sizes().length === 0);
  readonly showCollapseStock = computed(
    () => !this.isCreate() && this.hadSizes() && this.sizes().length === 0,
  );
  readonly flatStockError = computed(() => {
    if (!this.showFlatStock() && !this.showCollapseStock()) return '';
    const value = this.flatStock();
    if ((this.#saveTried() || value.trim() !== '0') && !isAllowedCount(value)) {
      return STOCK_MESSAGE;
    }
    return '';
  });
  readonly weightError = computed(() => {
    const raw = this.weight().trim();
    if (raw.length === 0) return '';
    return parseWeightGrams(raw) === null ? WEIGHT_MESSAGE : '';
  });
  readonly replacingFlatStock = computed(
    () => !this.isCreate() && !this.hadSizes() && this.sizes().length > 0,
  );
  readonly showStockReadout = computed(
    () => !this.isCreate() && !this.showCollapseStock() && !this.replacingFlatStock(),
  );
  readonly flatReplacementNote = computed(() => {
    const stock = this.#loadedProduct()?.stock;
    if (typeof stock !== 'number') {
      return 'These starting counts replace the current total. That total is not set yet.';
    }
    return `These starting counts replace the current total of ${stock}.`;
  });
  readonly stockReadout = computed(() => {
    const stock = this.#loadedProduct()?.stock;
    if (typeof stock !== 'number') return 'Not set';
    return stock > 0 ? `In stock: ${stock}` : 'Out of stock';
  });
  readonly publishError = computed(() =>
    this.model().published && this.images().length < 1
      ? 'Add at least one photo before showing it on the store.'
      : '',
  );

  readonly newArrivalChecked = computed(() => this.newArrivalUntilInput().trim().length > 0);

  readonly newArrivalCountdown = computed(() => {
    const date = parseDateInputValue(this.newArrivalUntilInput());
    if (!date) return null;
    // End of local day so "today" still counts as active.
    const untilMs = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    return newArrivalCountdownLabel(untilMs);
  });

  readonly editForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => {
      const name = collapseSpaces(asText(value()));
      if (name.length === 0) return { kind: 'name', message: 'Give the product a name.' };
      if (name.length > 200) {
        return { kind: 'name', message: 'The name must be 200 characters or fewer.' };
      }
      return undefined;
    });
    validate(path.slug, ({ value }) => {
      if (this.productId()) return undefined;
      const slug = asText(value()).trim();
      if (slug.length === 0) return undefined;
      if (!isWebSlug(slug)) {
        return {
          kind: 'slug',
          message: 'Use lowercase letters, numbers and dashes for the web address.',
        };
      }
      return undefined;
    });
    validate(path.summary, ({ value }) => {
      if (asText(value()).trim().length > 300) {
        return { kind: 'summary', message: 'The summary must be 300 characters or fewer.' };
      }
      return undefined;
    });
    validate(path.description, ({ value }) => {
      if (asText(value()).trim().length > 5_000) {
        return { kind: 'description', message: 'The description must be 5,000 characters or fewer.' };
      }
      return undefined;
    });
    validate(path.details, ({ value }) => {
      const lines = detailLinesFromText(asText(value()));
      if (lines.length > MAX_DETAIL_LINES) {
        return { kind: 'details', message: 'Add up to 20 lines of details.' };
      }
      if (lines.some((line) => line.length > MAX_DETAIL_LINE)) {
        return { kind: 'details', message: 'Keep each line of details to 200 characters or fewer.' };
      }
      return undefined;
    });
    validate(path.modelGroup, ({ value }) => {
      if (isModelGroup(asText(value()))) return undefined;
      return {
        kind: 'modelGroup',
        message: 'Use lowercase letters, numbers and dashes for the model group.',
      };
    });
    validate(path.categoryId, ({ value }) => {
      if (asText(value()).trim().length === 0) {
        return { kind: 'category', message: 'Choose a category.' };
      }
      return undefined;
    });
    validate(path.brandId, ({ value }) => {
      if (asText(value()).trim().length === 0) return { kind: 'brand', message: 'Choose a brand.' };
      return undefined;
    });
    validate(path.price, ({ value }) => {
      if (parseWholePounds(asText(value())) === null) {
        return { kind: 'price', message: 'Enter a price in whole pounds.' };
      }
      return undefined;
    });
    validate(path.compareAtPrice, ({ value }) => {
      const raw = asText(value()).trim();
      if (raw.length === 0) return undefined;
      const compare = parseWholePounds(raw);
      const price = parseWholePounds(asText(this.model().price));
      if (compare === null || price === null || compare <= price) {
        return {
          kind: 'compare',
          message: 'The original price must be higher than the selling price.',
        };
      }
      return undefined;
    });
  });

  constructor() {
    effect(() => {
      const current = this.model();
      if (
        current.categoryId !== this.#lastSuggestedCategory &&
        current.type === this.#lastType
      ) {
        this.#categoryPicked = true;
        this.#lastSuggestedCategory = current.categoryId;
      }
      if (current.type !== this.#lastType) {
        this.#lastType = current.type;
        if (!this.#categoryPicked) {
          const suggested = defaultCategoryForType(current.type);
          this.#lastSuggestedCategory = suggested;
          untracked(() => {
            this.model.update((prev) => ({ ...prev, categoryId: suggested }));
          });
        }
      }
    });

    // New products: fill the shipping weight from the category (and "jacket" in the name) while
    // the field still holds the last suggestion. A weight the admin typed, or cleared, stays.
    effect(() => {
      const { categoryId, name } = this.model();
      if (!this.isCreate()) return;
      const suggested = this.#suggestWeight(categoryId, name);
      untracked(() => {
        const current = this.weight().trim();
        if (current !== this.#suggestedWeight) return;
        const next = suggested === null ? '' : String(suggested);
        this.#suggestedWeight = next;
        if (current !== next) this.weight.set(next);
      });
    });

    effect(() => {
      const description = this.model().description;
      if (!this.#ready()) return;
      this.#descriptionTouched = description !== this.#descriptionBaseline;
    });

    effect(() => {
      if (!isPlatformBrowser(this.#platformId)) return;
      if (this.editorResource.status() !== 'resolved') return;
      const value = this.editorResource.value();
      if (!value) return;
      const id = this.productId();
      if (id && !value.product) {
        if (this.#missingNotified) return;
        this.#missingNotified = true;
        untracked(() => {
          this.#snackbar.error('This product no longer exists.');
          void this.#router.navigate(['/admin/products']);
        });
        return;
      }
      const target = `${id ?? 'new'}:${this.#reloadTick()}`;
      if (this.#hydratedKey === target && this.#hydratedValue === value) return;
      this.#hydratedKey = target;
      this.#hydratedValue = value;
      untracked(() => {
        this.#apply(id ? value.product : null);
        this.#ready.set(true);
      });
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Product | Atteya Admin',
      description: 'Add or edit a store product.',
      noindex: true,
    });
  }

  loadMessage(error: unknown): string {
    return importActionError(error);
  }

  registerUpload(path: string): void {
    this.#tracker.register(path);
  }

  hasColor(colorId: ColorId): boolean {
    return this.selectedColors().includes(colorId);
  }

  toggleColor(colorId: ColorId): void {
    const current = this.selectedColors();
    if (current.includes(colorId)) {
      this.selectedColors.set(current.filter((id) => id !== colorId));
      this.colorError.set('');
      return;
    }
    if (current.length >= 12) {
      this.colorError.set('Choose up to 12 colours.');
      return;
    }
    this.selectedColors.set(sortColors([...current, colorId]));
    this.colorError.set('');
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
        this.tagError.set('Tags use lowercase letters, numbers and dashes.');
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

  hasSize(label: string): boolean {
    const key = label.trim().toLowerCase();
    return this.sizes().some((size) => size.label.toLowerCase() === key);
  }

  onSizeInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.sizeInput.set(target.value);
    this.sizeError.set('');
  }

  onSizeKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addPendingSize();
    }
  }

  addQuickSize(label: string): void {
    if (this.sizeEditorDisabled() || this.hasSize(label)) return;
    this.sizeInput.set(label);
    this.addPendingSize();
  }

  addPendingSize(): void {
    if (this.sizeEditorDisabled()) return;
    const parts = this.sizeInput()
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) return;
    const next = [...this.sizes()];
    for (const label of parts) {
      if (label.length > 20) {
        this.sizeError.set('Each size needs a name of 20 characters or fewer.');
        return;
      }
      if (next.some((size) => size.label.toLowerCase() === label.toLowerCase())) {
        this.sizeError.set('This size is already in the list.');
        return;
      }
      if (next.length >= 20) {
        this.sizeError.set('You can add up to 20 sizes.');
        return;
      }
      next.push({ label, initialStock: '0', isNew: true });
    }
    this.sizes.set(next);
    this.sizeInput.set('');
    this.sizeError.set('');
  }

  removeSize(index: number): void {
    if (this.sizeEditorDisabled()) return;
    this.sizes.update((list) => list.filter((_, itemIndex) => itemIndex !== index));
  }

  moveSize(index: number, direction: -1 | 1): void {
    if (this.sizeEditorDisabled()) return;
    const nextIndex = index + direction;
    const list = [...this.sizes()];
    const current = list[index];
    const swap = list[nextIndex];
    if (!current || !swap) return;
    list[index] = swap;
    list[nextIndex] = current;
    this.sizes.set(list);
  }

  sizeStockEditable(size: ProductSizeDraft): boolean {
    return this.isCreate() || size.isNew || (!size.isNew && !!size.id && !this.sizeEditorDisabled());
  }

  sizeStockLabel(size: ProductSizeDraft): string {
    return size.isNew ? `Starting stock for ${size.label}` : `Stock for ${size.label}`;
  }

  sizeStockError(size: ProductSizeDraft): string {
    if (!this.sizeStockEditable(size)) return '';
    const value = size.initialStock;
    if ((this.#saveTried() || value.trim() !== '0') && !isAllowedCount(value)) {
      return STOCK_MESSAGE;
    }
    return '';
  }

  onSizeStock(index: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    this.sizes.update((list) =>
      list.map((size, itemIndex) =>
        itemIndex === index ? { ...size, initialStock: value } : size,
      ),
    );
  }

  onFlatStock(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.flatStock.set(target.value);
  }

  onWeight(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.weight.set(target.value);
  }

  countLabel(size: ProductSizeDraft): string {
    const map = this.#loadedProduct()?.stockBySize;
    if (!size.id || !map) return 'Not set';
    const count = map[size.id];
    return typeof count === 'number' ? String(count) : 'Not set';
  }

  async cancel(): Promise<void> {
    if (this.isSaving()) return;
    const livePaths = this.#loadedProduct()?.images.map((image) => image.path) ?? [];
    try {
      await this.#uploads.deleteImages(this.#tracker.orphansOnDiscard(livePaths));
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
      return;
    }
    await this.#router.navigate(['/admin/products']);
  }

  async save(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.isSaving() || !this.#ready()) return;
    this.#saveTried.set(true);
    if (this.tagInput().trim()) {
      this.addPendingTag();
      if (this.tagError()) return;
    }
    if (this.sizeInput().trim() && !this.sizeEditorDisabled()) {
      this.addPendingSize();
      if (this.sizeError()) return;
    }
    this.formError.set(this.#blockers());
    if (this.formError() && isPlatformBrowser(this.#platformId)) {
      // aria-invalid is painted after this signal write.
      requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      });
    }
    await submit(this.editForm, async () => {
      if (this.formError()) return;
      await this.#persist();
    });
  }

  /**
   * Default shipping weight for a new product: the category's saved default (Catalogue Tools →
   * Shipping Weights), then its parent's, then the built-in one; a "jacket" is 800 g.
   */
  #suggestWeight(categoryId: string, name: string): number | null {
    const categories = this.editorResource.value()?.categories ?? [];
    const saved: Record<string, number | null> = {};
    for (const category of categories) {
      if (category.defaultWeightGrams !== undefined) saved[category.id] = category.defaultWeightGrams;
    }
    const ancestors = categories.find((category) => category.id === categoryId)?.ancestorIds ?? [];
    return defaultWeightGrams([categoryId, ...ancestors], name, saved);
  }

  #apply(product: Product | null): void {
    if (!product) {
      if (!this.#createdId()) this.#createdId.set(this.#admin.newProductId());
      const fields = emptyFields();
      this.#lastType = fields.type;
      this.#lastSuggestedCategory = fields.categoryId;
      this.#categoryPicked = false;
      this.#descriptionBaseline = '';
      this.#descriptionTouched = false;
      this.model.set(fields);
      this.images.set([]);
      this.selectedColors.set([]);
      this.tags.set([]);
      this.tagInput.set('');
      this.tagError.set('');
      this.marketingBadgeKind.set('');
      this.marketingBadgeStyle.set('plain');
      this.newArrivalUntilInput.set('');
      this.newArrivalError.set('');
      this.colorError.set('');
      this.sizes.set([]);
      this.sizeInput.set('');
      this.sizeError.set('');
      this.flatStock.set('0');
      const weight = this.#suggestWeight(fields.categoryId, fields.name);
      this.#suggestedWeight = weight === null ? '' : String(weight);
      this.weight.set(this.#suggestedWeight);
      this.formError.set('');
      this.#saveTried.set(false);
      this.#loadedProduct.set(null);
      return;
    }

    if (this.#ready() && this.#loadedProduct()?.id === product.id) {
      this.sizes.set(mergeSizeIds(this.sizes(), product));
      this.#loadedProduct.set(product);
      this.#descriptionBaseline = this.model().description;
      this.#descriptionTouched = false;
      this.flatStock.set('0');
      this.formError.set('');
      this.#saveTried.set(false);
      return;
    }

    const description = plainFromHtml(product.descriptionHtml);
    this.#lastType = product.type;
    this.#lastSuggestedCategory = product.categoryId;
    this.#categoryPicked = false;
    this.#descriptionBaseline = description;
    this.#descriptionTouched = false;
    this.model.set({
      name: product.name,
      slug: product.slug,
      summary: product.summary ?? '',
      description,
      details: product.details.join('\n'),
      type: product.type,
      categoryId: product.categoryId,
      brandId: product.brandId,
      modelGroup: product.modelGroup ?? '',
      gender: product.gender ?? '',
      price: String(product.price),
      compareAtPrice: product.compareAtPrice === null ? '' : String(product.compareAtPrice),
      published: product.published,
    });
    this.images.set(product.images.map((image) => toImageAsset(image)));
    this.selectedColors.set(sortColors(product.colors ?? []));
    this.tags.set([...(product.tags ?? [])]);
    this.tagInput.set('');
    this.tagError.set('');
    this.marketingBadgeKind.set(product.marketingBadge?.kind ?? '');
    this.marketingBadgeStyle.set(product.marketingBadge?.style ?? 'plain');
    this.newArrivalUntilInput.set(
      isActiveNewArrival(product.newArrivalUntil)
        ? toDateInputValue(new Date(timestampToMs(product.newArrivalUntil)!))
        : '',
    );
    this.newArrivalError.set('');
    this.colorError.set('');
    this.sizes.set(sizeDraftsFrom(product));
    this.sizeInput.set('');
    this.sizeError.set('');
    this.flatStock.set('0');
    this.weight.set(
      typeof product.weightGrams === 'number' ? String(product.weightGrams) : '',
    );
    this.formError.set('');
    this.#saveTried.set(false);
    this.#loadedProduct.set(product);
  }

  #blockers(): string {
    if (this.publishError()) return this.publishError();
    if (this.images().length > 8) return 'Add up to 8 photos.';
    for (const image of this.images()) {
      const alt = image.alt.trim();
      if (alt.length < 1 || alt.length > 125) {
        return 'Describe each photo in 125 characters or fewer.';
      }
      if (!isSafeProductPath(image.path)) {
        return "One of the photos can't be saved. Remove it and add it again.";
      }
    }
    if (this.selectedColors().length > 12) return 'Choose up to 12 colours.';
    if (this.tags().length > 20) return 'You can add up to 20 tags.';
    if (this.tagError()) return this.tagError();
    if (this.sizeError()) return this.sizeError();
    if (this.sizes().length > 20) return 'You can add up to 20 sizes.';
    const labels = new Set<string>();
    for (const size of this.sizes()) {
      const label = size.label.trim();
      if (label.length < 1 || label.length > 20) {
        return 'Each size needs a name of 20 characters or fewer.';
      }
      const key = label.toLowerCase();
      if (labels.has(key)) return 'This size is already in the list.';
      labels.add(key);
      if (this.sizeStockEditable(size) && !isAllowedCount(size.initialStock)) {
        return STOCK_MESSAGE;
      }
    }
    if ((this.showFlatStock() || this.showCollapseStock()) && !isAllowedCount(this.flatStock())) {
      return STOCK_MESSAGE;
    }
    if (this.weightError()) return this.weightError();
    if (this.newArrivalError()) return this.newArrivalError();
    if (this.newArrivalChecked() && !parseDateInputValue(this.newArrivalUntilInput())) {
      return 'Choose a valid New arrival end date.';
    }
    return '';
  }

  async #persist(): Promise<void> {
    this.isSaving.set(true);
    try {
      const payload = this.#payload();
      const id = this.productId();
      if (id) {
        await this.#admin.updateProduct({ ...payload, productId: id });
        const stockChange = this.#stockChange();
        if (stockChange) {
          await this.#admin.saveStock(id, stockChange);
        }
      } else {
        const slug = asText(this.model().slug).trim();
        const result = await this.#admin.createProduct({
          ...payload,
          productId: this.activeId(),
          ...(slug.length > 0 ? { slug } : {}),
        });
        await this.#deleteUnkept();
        this.#snackbar.success(`Product created. Its web address is /product/${result.slug}.`);
        await this.#router.navigate(['/admin/products', result.id]);
        return;
      }
      await this.#deleteUnkept();
      this.#snackbar.success('Product saved.');
      this.#reloadTick.update((tick) => tick + 1);
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  async #deleteUnkept(): Promise<void> {
    const kept = this.images().map((image) => image.path);
    try {
      await this.#uploads.deleteImages(this.#tracker.orphansOnDiscard(kept));
      this.#tracker.clear();
    } catch {
      // Session photos that were not kept stay in Storage.
    }
  }

  #stockChange(): StockChange | null {
    const product = this.#loadedProduct();
    if (this.isCreate() || !product?.stockBySize) return null;
    const live = product.stockBySize;
    const stockBySize: Record<string, number> = {};
    for (const size of this.sizes()) {
      if (size.isNew || !size.id) continue;
      const next = Number(size.initialStock.trim());
      const prev = live[size.id];
      if (typeof prev === 'number' && prev === next) continue;
      stockBySize[size.id] = next;
    }
    return Object.keys(stockBySize).length > 0 ? { stockBySize } : null;
  }

  onMarketingBadgeKindChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.marketingBadgeKind.set(
      value === '' ? '' : (value as MarketingBadgeKind),
    );
  }

  onMarketingBadgeStyleChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.marketingBadgeStyle.set(target.value as MarketingBadgeStyle);
  }

  onNewArrivalToggle(checked: boolean): void {
    this.newArrivalError.set('');
    if (!checked) {
      this.newArrivalUntilInput.set('');
      return;
    }
    if (!this.newArrivalUntilInput().trim()) {
      this.newArrivalUntilInput.set(toDateInputValue(defaultNewArrivalUntil()));
    }
  }

  onNewArrivalDateChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    this.newArrivalError.set('');
    if (!value.trim()) {
      this.newArrivalUntilInput.set('');
      return;
    }
    if (!parseDateInputValue(value)) {
      this.newArrivalError.set('Choose a valid New arrival end date.');
      return;
    }
    this.newArrivalUntilInput.set(value);
  }

  #marketingBadgePayload(): ProductFormPayload['marketingBadge'] {
    const kind = this.marketingBadgeKind();
    if (!kind) return null;
    return { kind, style: this.marketingBadgeStyle() };
  }

  #newArrivalUntilPayload(): string | null {
    const date = parseDateInputValue(this.newArrivalUntilInput());
    if (!date) return null;
    const endOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    );
    return endOfDay.toISOString();
  }

  #payload(): ProductFormPayload {
    const value = this.model();
    const price = parseWholePounds(asText(value.price)) ?? 0;
    const compareRaw = asText(value.compareAtPrice).trim();
    const compareAtPrice = compareRaw.length === 0 ? null : parseWholePounds(compareRaw);
    const descriptionText = asText(value.description).trim();
    const sendDescription = this.isCreate() || this.#descriptionTouched;
    const sendStock = this.showFlatStock() || this.showCollapseStock();
    return {
      name: collapseSpaces(asText(value.name)),
      summary: asText(value.summary).trim() || null,
      ...(sendDescription
        ? { description: descriptionText.length === 0 ? null : descriptionText }
        : {}),
      details: detailLinesFromText(asText(value.details)),
      type: value.type,
      categoryId: value.categoryId.trim(),
      brandId: value.brandId.trim(),
      modelGroup: asText(value.modelGroup).trim() || null,
      gender: value.gender === '' ? null : value.gender,
      colors: this.selectedColors(),
      tags: this.tags(),
      marketingBadge: this.#marketingBadgePayload(),
      newArrivalUntil: this.#newArrivalUntilPayload(),
      price,
      compareAtPrice,
      published: value.published,
      images: this.images().map((image) => ({
        path: image.path,
        alt: image.alt.trim(),
        ...(typeof image.width === 'number' ? { width: image.width } : {}),
        ...(typeof image.height === 'number' ? { height: image.height } : {}),
      })),
      sizes: this.sizes().map((size) => toSizePayload(size, this.isCreate())),
      ...(sendStock ? { stock: Number(this.flatStock().trim()) } : {}),
      weightGrams:
        this.weight().trim().length === 0 ? null : parseWeightGrams(this.weight()),
    };
  }
}

function emptyFields(): EditorFields {
  const type = PRODUCT_TYPES[0].id;
  return {
    name: '',
    slug: '',
    summary: '',
    description: '',
    details: '',
    type,
    categoryId: defaultCategoryForType(type),
    brandId: '',
    modelGroup: '',
    gender: '',
    price: '',
    compareAtPrice: '',
    published: false,
  };
}

function hasSizeOption(product: Product | null): boolean {
  if (!product) return false;
  return product.options.some((option) => option.key === 'size' && option.values.length > 0);
}

function mergeSizeIds(
  draft: readonly ProductSizeDraft[],
  product: Product,
): ProductSizeDraft[] {
  const option = product.options.find((item) => item.key === 'size');
  const live = option?.values ?? [];
  const used = new Set<number>();
  return draft.map((size) => {
    const index = live.findIndex(
      (value, valueIndex) =>
        !used.has(valueIndex) && value.label.toLowerCase() === size.label.trim().toLowerCase(),
    );
    if (index < 0) return size;
    used.add(index);
    const match = live[index];
    if (!match) return size;
    return {
      id: match.id,
      label: match.label,
      initialStock: stockDraftFromMap(product.stockBySize, match.id),
      isNew: false,
    };
  });
}

function sizeDraftsFrom(product: Product): ProductSizeDraft[] {
  const option = product.options.find((item) => item.key === 'size');
  if (!option) return [];
  return option.values.map((value) => ({
    id: value.id,
    label: value.label,
    initialStock: stockDraftFromMap(product.stockBySize, value.id),
    isNew: false,
  }));
}

function stockDraftFromMap(
  map: Readonly<Record<string, number>> | undefined,
  sizeId: string,
): string {
  if (!map) return '0';
  const count = map[sizeId];
  return typeof count === 'number' ? String(count) : '0';
}

function toSizePayload(size: ProductSizeDraft, create: boolean): ProductSizePayload {
  const label = size.label.trim();
  if (create || size.isNew) {
    return { label, initialStock: Number(size.initialStock.trim()) };
  }
  return size.id ? { label, id: size.id } : { label };
}

function toImageAsset(image: Product['images'][number]): ImageAsset {
  return {
    path: image.path,
    alt: image.alt,
    ...(typeof image.width === 'number' ? { width: image.width } : {}),
    ...(typeof image.height === 'number' ? { height: image.height } : {}),
  };
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'TR',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
]);

/** Text for the textarea: blank line between blocks, newline for <br>. Round-trips with descriptionToHtml(). */
function plainFromHtml(html: string | null): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const paragraphs: string[] = [];
  let current = '';
  const flush = (): void => {
    const text = current
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
    if (text.length > 0) paragraphs.push(text);
    current = '';
  };
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += (node.textContent ?? '').replace(/[\r\n]+/g, ' ');
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
      current += '\n';
      return;
    }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) flush();
    node.childNodes.forEach(walk);
    if (block) flush();
  };
  body.childNodes.forEach(walk);
  flush();
  return paragraphs.join('\n\n');
}

function collapseSpaces(value: string): string {
  return value.trim().split(/\s+/).filter((part) => part.length > 0).join(' ');
}

function asText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value : '';
}

function parseWholePounds(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PRICE) return null;
  return value;
}

function isWebSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 80 && isModelGroup(value);
}

function parseWeightGrams(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_WEIGHT_GRAMS ? value : null;
}

function isAllowedCount(raw: string): boolean {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return false;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
}

function isSafeProductPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 300 &&
    path.startsWith('products/') &&
    !path.startsWith('/') &&
    !path.includes('..') &&
    !path.includes('://')
  );
}
