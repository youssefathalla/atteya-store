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
import { Router, RouterLink } from '@angular/router';
import { offerMatch, type Offer } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { COLOR_PALETTE, defaultWeightGrams, type ColorId } from '@core/services/products/catalog-taxonomy';
import {
  MARKETING_BADGE_KINDS,
  MARKETING_BADGE_LABELS,
  MARKETING_BADGE_STYLES,
  type MarketingBadgeKind,
  type MarketingBadgeStyle,
} from '@core/services/products/marketing-badge';
import { PlayerListService } from '@core/services/products/player-list.service';
import { MAX_PRODUCT_PLAYERS } from '@core/services/products/player.schema';
import { PRODUCT_GENDERS, PRODUCT_TYPES, SIZE_ORDER } from '@core/services/products/product.constants';
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
import { StorageAssetTracker, StorageUploadService } from '@core/services/storage';
import type { ImageAsset } from '@shared/schemas';
import { EgpPricePipe } from '@shared/pipes/egp-price.pipe';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { TextFieldInputComponent } from '@shared/ui/forms/text-field-input/text-field-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { ImageGalleryEditorComponent } from '@shared/ui/image-gallery-editor';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import type { ImageFolderPath } from '@shared/utils/image';
import { OffersAdminService } from '../offers-manager/services/offers-admin.service';
import type {
  ColourDraft,
  ModelSizeDraft,
  ProductModelColourPayload,
  ProductModelSharedPayload,
} from './models/product-admin.model';
import { ProductsAdminService } from './services/products-admin.service';
import { importActionError } from './utils/import-error';
import {
  buildBrandOptions,
  buildLeafCategoryOptions,
  defaultCategoryForType,
} from './utils/product-admin.utils';
import {
  asText,
  collapseSpaces,
  colourDraftFrom,
  colourName,
  colourSwatch,
  colourTotal,
  descriptionsDiffer,
  isSafeProductPath,
  newColourDraft,
  parseCount,
  parseWeightGrams,
  parseWholePounds,
  plainFromHtml,
  sharedDetailsDiffer,
  sharedPriceOf,
  sharedSizesFrom,
  SUMMARY_WORDS,
  wordCount,
} from './utils/product-model.utils';

const TAG_PATTERN = /^[a-z0-9-]{1,32}$/;
const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
const MAX_COLOURS = 12;
const MAX_SIZES = 20;
const STOCK_MESSAGE = 'Stock must be a whole number from 0 to 100,000.';
const WEIGHT_MESSAGE = 'Weight must be a whole number of grams from 0 to 100,000.';
const PRICE_MESSAGE = 'Enter a price in whole pounds.';
const COMPARE_MESSAGE = 'The old price must be higher than the price.';

interface SharedFields {
  name: string;
  summary: string;
  description: string;
  /** One fact per line (materials, racket specs). */
  details: string;
  type: ProductTypeId;
  categoryId: string;
  brandId: string;
  gender: '' | ProductGenderId;
  price: string;
  compareAtPrice: string;
}

interface OfferRow {
  readonly id: string;
  readonly title: string;
  readonly scope: string;
}

interface LoadedModel {
  readonly anchor: Product | null;
  readonly colours: readonly { readonly product: Product; readonly version: string }[];
  readonly categories: Awaited<ReturnType<ProductsAdminService['listAllCategories']>>;
  readonly brands: Awaited<ReturnType<ProductsAdminService['listAllBrands']>>;
  readonly offers: readonly Offer[];
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
    RouterLink,
    SelectInputComponent,
    TextInputComponent,
    TextFieldInputComponent,
    ImageGalleryEditorComponent,
    ColorSwatchComponent,
    EgpPricePipe,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './product-editor.page.html',
})
export class ProductEditorPageComponent implements OnInit {
  readonly productId = input<string>();

  readonly #admin = inject(ProductsAdminService);
  readonly #offersAdmin = inject(OffersAdminService);
  readonly #uploads = inject(StorageUploadService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #router = inject(Router);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #playerList = inject(PlayerListService);
  readonly #tracker = new StorageAssetTracker();

  readonly types = PRODUCT_TYPES;
  readonly genderOptions = GENDER_OPTIONS;
  readonly maxColours = MAX_COLOURS;
  readonly summaryWords = SUMMARY_WORDS;
  readonly marketingBadgeKinds = [
    { id: '', label: 'None' },
    ...MARKETING_BADGE_KINDS.map((kind) => ({ id: kind, label: MARKETING_BADGE_LABELS[kind] })),
  ] as const;
  readonly marketingBadgeStyles = MARKETING_BADGE_STYLES.map((style) => ({
    id: style,
    label: style === 'boxed' ? 'Boxed outline' : 'Plain text',
  }));

  readonly isSaving = signal(false);
  readonly formError = signal('');
  readonly model = signal<SharedFields>(emptyFields());
  readonly sizes = signal<readonly ModelSizeDraft[]>([]);
  readonly colours = signal<readonly ColourDraft[]>([]);
  readonly activeIndex = signal(0);
  readonly picking = signal(false);
  /** Photos are uploading for the active colour; switching colour or saving waits for them. */
  readonly photosBusy = signal(false);
  readonly sizeInput = signal('');
  readonly sizeError = signal('');
  readonly weight = signal('');
  readonly tags = signal<readonly string[]>([]);
  readonly tagInput = signal('');
  readonly tagError = signal('');
  readonly selectedPlayers = signal<readonly string[]>([]);
  readonly playerError = signal('');
  readonly playerOptions = this.#playerList.players;
  readonly playersLoading = this.#playerList.isLoading;
  readonly marketingBadgeKind = signal<MarketingBadgeKind | ''>('');
  readonly marketingBadgeStyle = signal<MarketingBadgeStyle>('plain');
  /** Local YYYY-MM-DD when flagged; empty when not a new arrival. */
  readonly newArrivalUntilInput = signal('');
  readonly newArrivalError = signal('');
  readonly detailsDiffer = signal(false);
  readonly offerRows = signal<readonly OfferRow[]>([]);
  readonly #saveTried = signal(false);
  readonly #ready = signal(false);
  readonly #reloadTick = signal(0);
  readonly #savedImagePaths = signal<readonly string[]>([]);

  #lastType: ProductTypeId = PRODUCT_TYPES[0].id;
  #lastSuggestedCategory = defaultCategoryForType(PRODUCT_TYPES[0].id);
  #categoryPicked = false;
  /** Last weight the page filled in from the category ('' = none), so a typed weight is kept. */
  #suggestedWeight = '';
  #descriptionBaseline = '';
  /** The saved colours had different descriptions, so the one on the page is always sent. */
  #descriptionsDiffer = false;
  #hydratedValue: unknown = null;
  #missingNotified = false;
  #newSizeCounter = 0;

  readonly editorResource = resource({
    params: () => ({ productId: this.productId() ?? null, tick: this.#reloadTick() }),
    loader: async ({ params }): Promise<LoadedModel | null> => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const [catalogue, offers] = await Promise.all([
        Promise.all([this.#admin.listAllCategories(), this.#admin.listAllBrands()]),
        this.#offersAdmin.listOffers().catch(() => [] as readonly Offer[]),
      ]);
      const [categories, brands] = catalogue;
      if (!params.productId) return { anchor: null, colours: [], categories, brands, offers };
      // Versions first, documents second: a change in between makes the save refuse, never overwrite.
      let versions: Awaited<ReturnType<ProductsAdminService['getProductModel']>>;
      try {
        versions = await this.#admin.getProductModel(params.productId);
      } catch (error: unknown) {
        if (isNotFound(error)) return { anchor: null, colours: [], categories, brands, offers };
        throw error;
      }
      const products = await Promise.all(versions.colours.map((colour) => this.#admin.getProduct(colour.id)));
      const colours = versions.colours.flatMap((colour, index) => {
        const product = products[index];
        return product ? [{ product, version: colour.version }] : [];
      });
      const anchor = colours.find((colour) => colour.product.id === params.productId)?.product ?? null;
      return { anchor, colours, categories, brands, offers };
    },
  });

  readonly showForm = computed(() => this.#ready() && !this.editorResource.error());
  readonly isCreate = computed(() => !this.productId());
  readonly crumb = computed(() => (this.isCreate() ? 'Products / New' : 'Products / Edit'));
  readonly heading = computed(() => collapseSpaces(this.model().name) || 'New Product');
  readonly saveLabel = computed(() => (this.isCreate() ? 'Create Product' : 'Save Changes'));
  readonly addColourLabel = computed(() => (this.colours().length > 0 ? 'Add Colour' : 'Add First Colour'));
  readonly categoryOptions = computed(() =>
    buildLeafCategoryOptions(this.editorResource.value()?.categories ?? []),
  );
  readonly brandOptions = computed(() => buildBrandOptions(this.editorResource.value()?.brands ?? []));
  readonly sharedPrice = computed(() => parseWholePounds(asText(this.model().price)));
  readonly activeColour = computed(() => this.colours()[this.activeIndex()] ?? null);
  readonly activeName = computed(() => colourName(this.activeColour()?.colors ?? []));
  readonly photoFolder = computed(
    (): ImageFolderPath => `products/${this.activeColour()?.productId ?? 'unsaved'}`,
  );
  readonly paletteChoices = computed(() => {
    const used = new Set(this.colours().flatMap((colour) => colour.colors.slice(0, 1)));
    return COLOR_PALETTE.filter((entry) => !used.has(entry.id));
  });
  readonly canAddColour = computed(() => this.colours().length < MAX_COLOURS);
  readonly overview = computed(() => {
    const colours = this.colours();
    if (colours.length === 0) return 'Fill in the product, then add its first colour.';
    const shown = colours.filter((colour) => this.isOffered(colour)).length;
    const noun = colours.length === 1 ? 'colour' : 'colours';
    return `${colours.length} ${noun} · ${shown} shown to shoppers`;
  });
  readonly sizeChoices = computed(() => {
    const current = this.sizes().map((size) => size.label);
    const quick: string[] = SIZE_ORDER.filter((label) => (QUICK_SIZES as readonly string[]).includes(label));
    const extra = current.filter(
      (label) => !quick.some((item) => item.toLowerCase() === label.toLowerCase()),
    );
    return [...quick, ...extra];
  });
  readonly summaryCount = computed(() => wordCount(asText(this.model().summary)));
  readonly summaryHint = computed(() => {
    const count = this.summaryCount();
    return count > SUMMARY_WORDS
      ? `${count} words. Keep it to ${SUMMARY_WORDS} or fewer.`
      : `Up to ${SUMMARY_WORDS} words. Shown on cards, the bag and search. (${count}/${SUMMARY_WORDS})`;
  });
  readonly weightError = computed(() => {
    const raw = this.weight().trim();
    if (raw.length === 0) return '';
    return parseWeightGrams(raw) === null ? WEIGHT_MESSAGE : '';
  });
  readonly newArrivalChecked = computed(() => this.newArrivalUntilInput().trim().length > 0);
  readonly newArrivalCountdown = computed(() => {
    const date = parseDateInputValue(this.newArrivalUntilInput());
    if (!date) return null;
    // End of local day so "today" still counts as active.
    const untilMs = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
    return newArrivalCountdownLabel(untilMs);
  });

  readonly editForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => {
      const name = collapseSpaces(asText(value()));
      if (name.length === 0) return { kind: 'name', message: 'Give the product a name.' };
      if (name.length > 200) return { kind: 'name', message: 'The name must be 200 characters or fewer.' };
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
      if (lines.length > MAX_DETAIL_LINES)
        return { kind: 'details', message: 'Add up to 20 lines of details.' };
      if (lines.some((line) => line.length > MAX_DETAIL_LINE)) {
        return { kind: 'details', message: 'Keep each line of details to 200 characters or fewer.' };
      }
      return undefined;
    });
    validate(path.categoryId, ({ value }) =>
      asText(value()).trim().length === 0 ? { kind: 'category', message: 'Choose a category.' } : undefined,
    );
    validate(path.brandId, ({ value }) =>
      asText(value()).trim().length === 0 ? { kind: 'brand', message: 'Choose a brand.' } : undefined,
    );
    validate(path.price, ({ value }) =>
      parseWholePounds(asText(value())) === null ? { kind: 'price', message: PRICE_MESSAGE } : undefined,
    );
    validate(path.compareAtPrice, ({ value }) => {
      const raw = asText(value()).trim();
      if (raw.length === 0) return undefined;
      const compare = parseWholePounds(raw);
      const price = parseWholePounds(asText(this.model().price));
      if (compare === null || price === null || compare <= price) {
        return { kind: 'compare', message: COMPARE_MESSAGE };
      }
      return undefined;
    });
  });

  constructor() {
    // A new type suggests its category until the category is picked by hand.
    effect(() => {
      const current = this.model();
      if (current.categoryId !== this.#lastSuggestedCategory && current.type === this.#lastType) {
        this.#categoryPicked = true;
        this.#lastSuggestedCategory = current.categoryId;
      }
      if (current.type !== this.#lastType) {
        this.#lastType = current.type;
        if (!this.#categoryPicked) {
          const suggested = defaultCategoryForType(current.type);
          this.#lastSuggestedCategory = suggested;
          untracked(() => this.model.update((prev) => ({ ...prev, categoryId: suggested })));
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
      if (!isPlatformBrowser(this.#platformId)) return;
      if (this.editorResource.status() !== 'resolved') return;
      const value = this.editorResource.value();
      if (!value || value === this.#hydratedValue) return;
      this.#hydratedValue = value;
      untracked(() => {
        if (this.productId() && !value.anchor) {
          if (this.#missingNotified) return;
          this.#missingNotified = true;
          this.#snackbar.error('This product no longer exists.');
          void this.#router.navigate(['/admin/products']);
          return;
        }
        this.#apply(value);
        this.#ready.set(true);
      });
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Product | Atteya Admin',
      description: 'Add or edit a store product and its colours.',
      noindex: true,
    });
  }

  loadMessage(error: unknown): string {
    return importActionError(error);
  }

  registerUpload(path: string): void {
    this.#tracker.register(path);
  }

  // ── Colours ────────────────────────────────────────────────────────────

  colourName(colour: ColourDraft): string {
    return colourName(colour.colors);
  }

  colourSwatch(colour: ColourDraft): string | null {
    return colourSwatch(colour.colors[0]);
  }

  total(colour: ColourDraft): number {
    return colourTotal(colour, this.sizes());
  }

  /** The price a colour sells at: its own, or the product price. */
  priceOf(colour: ColourDraft): number | null {
    return colour.ownPrice ? parseWholePounds(colour.price) : this.sharedPrice();
  }

  isOffered(colour: ColourDraft): boolean {
    return colour.published && this.total(colour) > 0;
  }

  /** Under the colour name on its tab. */
  tabLine(colour: ColourDraft): string {
    if (!colour.published) return 'Hidden by you';
    const total = this.total(colour);
    if (total === 0) return 'Sold out, hidden';
    const price = this.priceOf(colour);
    return `${price === null ? 'EGP —' : `EGP ${price.toLocaleString('en-US')}`} · ${total} in stock`;
  }

  /** "What shoppers see" line for a colour. */
  shopperLine(colour: ColourDraft): string {
    if (!colour.published) return 'Hidden';
    if (this.total(colour) === 0) return 'Hidden (sold out)';
    const price = this.priceOf(colour);
    return `Shown · ${price === null ? 'EGP —' : `EGP ${price.toLocaleString('en-US')}`}`;
  }

  selectColour(index: number): void {
    if (this.photosBusy() && index !== this.activeIndex()) return;
    this.activeIndex.set(index);
    this.picking.set(false);
  }

  togglePicking(): void {
    this.picking.update((open) => !open);
  }

  addColour(color: ColorId): void {
    if (!this.canAddColour() || this.photosBusy()) return;
    const draft = newColourDraft(this.#admin.newProductId(), color);
    const stock: Record<string, string> = {};
    for (const size of this.sizes()) stock[size.key] = '0';
    this.colours.update((list) => [...list, { ...draft, stock }]);
    this.activeIndex.set(this.colours().length - 1);
    this.picking.set(false);
    this.formError.set('');
  }

  #updateActive(change: (colour: ColourDraft) => ColourDraft): void {
    const index = this.activeIndex();
    this.colours.update((list) => list.map((colour, at) => (at === index ? change(colour) : colour)));
  }

  setActiveImages(images: ImageAsset[]): void {
    this.#updateActive((colour) => ({ ...colour, images }));
  }

  toggleHidden(): void {
    this.#updateActive((colour) => ({ ...colour, published: !colour.published }));
  }

  toggleOwnPrice(checked: boolean): void {
    this.#updateActive((colour) => ({
      ...colour,
      ownPrice: checked,
      price: checked && colour.price.trim() === '' ? asText(this.model().price) : colour.price,
    }));
  }

  onColourPrice(field: 'price' | 'compareAtPrice', event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    this.#updateActive((colour) => ({ ...colour, [field]: value }));
  }

  ownPriceError(colour: ColourDraft): string {
    if (!colour.ownPrice) return '';
    if (parseWholePounds(colour.price) === null) {
      return this.#saveTried() || colour.price.trim() !== '' ? PRICE_MESSAGE : '';
    }
    return '';
  }

  ownCompareError(colour: ColourDraft): string {
    if (!colour.ownPrice) return '';
    const raw = colour.compareAtPrice.trim();
    if (raw.length === 0) return '';
    const compare = parseWholePounds(raw);
    const price = parseWholePounds(colour.price);
    return compare === null || price === null || compare <= price ? COMPARE_MESSAGE : '';
  }

  isMade(colour: ColourDraft, size: ModelSizeDraft): boolean {
    return !colour.notMade.includes(size.key);
  }

  toggleMade(size: ModelSizeDraft): void {
    this.#updateActive((colour) => {
      const made = !colour.notMade.includes(size.key);
      return made
        ? { ...colour, notMade: [...colour.notMade, size.key] }
        : {
            ...colour,
            notMade: colour.notMade.filter((key) => key !== size.key),
            stock: { ...colour.stock, [size.key]: colour.stock[size.key] || '0' },
          };
    });
  }

  stockValue(colour: ColourDraft, size: ModelSizeDraft): string {
    return colour.stock[size.key] ?? '';
  }

  onStock(size: ModelSizeDraft, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    this.#updateActive((colour) => ({ ...colour, stock: { ...colour.stock, [size.key]: value } }));
  }

  onFlatStock(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    this.#updateActive((colour) => ({ ...colour, flatStock: value }));
  }

  stockError(raw: string): string {
    if (raw.trim() === '' && !this.#saveTried()) return '';
    return parseCount(raw) === null ? STOCK_MESSAGE : '';
  }

  isZero(raw: string): boolean {
    return parseCount(raw) === 0;
  }

  // ── Sizes ──────────────────────────────────────────────────────────────

  hasSize(label: string): boolean {
    const key = label.trim().toLowerCase();
    return this.sizes().some((size) => size.label.toLowerCase() === key);
  }

  toggleSize(label: string): void {
    const key = label.trim().toLowerCase();
    const existing = this.sizes().find((size) => size.label.toLowerCase() === key);
    if (existing) {
      this.sizes.update((list) => list.filter((size) => size !== existing));
      this.sizeError.set('');
      return;
    }
    this.#addSize(label);
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

  addPendingSize(): void {
    const parts = this.sizeInput()
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    for (const label of parts) {
      if (!this.#addSize(label)) return;
    }
    this.sizeInput.set('');
  }

  #addSize(label: string): boolean {
    if (label.length > 20) {
      this.sizeError.set('Each size needs a name of 20 characters or fewer.');
      return false;
    }
    if (this.hasSize(label)) {
      this.sizeError.set('This size is already in the list.');
      return false;
    }
    if (this.sizes().length >= MAX_SIZES) {
      this.sizeError.set('You can add up to 20 sizes.');
      return false;
    }
    this.#newSizeCounter += 1;
    const size: ModelSizeDraft = { key: `new-size-${this.#newSizeCounter}`, label };
    const order = (value: string): number =>
      (SIZE_ORDER as readonly string[]).findIndex((item) => item.toLowerCase() === value.toLowerCase());
    const rank = order(label);
    const wasFlat = this.sizes().length === 0;
    this.sizes.update((list) => {
      const at = rank < 0 ? -1 : list.findIndex((item) => order(item.label) > rank);
      return at < 0 ? [...list, size] : [...list.slice(0, at), size, ...list.slice(at)];
    });
    // When the first size replaces a single total, leave the box empty unless that
    // total was zero, so save asks for real counts instead of silently storing 0.
    this.colours.update((list) =>
      list.map((colour) => {
        const start = wasFlat && parseCount(colour.flatStock) !== 0 ? '' : '0';
        return { ...colour, stock: { ...colour.stock, [size.key]: start } };
      }),
    );
    this.sizeError.set('');
    return true;
  }

  // ── Players, tags, badge, new arrival ──────────────────────────────────

  hasPlayer(id: string): boolean {
    return this.selectedPlayers().includes(id);
  }

  togglePlayer(id: string): void {
    const current = this.selectedPlayers();
    if (current.includes(id)) {
      this.selectedPlayers.set(current.filter((item) => item !== id));
      this.playerError.set('');
      return;
    }
    if (current.length >= MAX_PRODUCT_PLAYERS) {
      this.playerError.set('Choose up to 10 players.');
      return;
    }
    this.selectedPlayers.set([...current, id]);
    this.playerError.set('');
  }

  onWeight(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.weight.set(target.value);
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

  onMarketingBadgeKindChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    this.marketingBadgeKind.set(value === '' ? '' : (value as MarketingBadgeKind));
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

  // ── Save and cancel ────────────────────────────────────────────────────

  async cancel(): Promise<void> {
    if (this.isSaving()) return;
    try {
      await this.#uploads.deleteImages(this.#tracker.orphansOnDiscard(this.#savedImagePaths()));
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
      return;
    }
    await this.#router.navigate(['/admin/products']);
  }

  async save(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.isSaving() || !this.#ready() || this.photosBusy()) return;
    this.#saveTried.set(true);
    if (this.tagInput().trim()) {
      this.addPendingTag();
      if (this.tagError()) return;
    }
    if (this.sizeInput().trim()) {
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

  #apply(value: LoadedModel): void {
    const { anchor } = value;
    this.formError.set('');
    this.#saveTried.set(false);
    this.sizeInput.set('');
    this.sizeError.set('');
    this.tagInput.set('');
    this.tagError.set('');
    this.playerError.set('');
    this.newArrivalError.set('');
    this.picking.set(false);

    if (!anchor) {
      const fields = emptyFields();
      this.#lastType = fields.type;
      this.#lastSuggestedCategory = fields.categoryId;
      this.#categoryPicked = false;
      this.#descriptionBaseline = '';
      this.#descriptionsDiffer = false;
      this.model.set(fields);
      this.sizes.set([]);
      this.colours.set([]);
      this.activeIndex.set(0);
      this.tags.set([]);
      this.selectedPlayers.set([]);
      this.marketingBadgeKind.set('');
      this.marketingBadgeStyle.set('plain');
      this.newArrivalUntilInput.set('');
      const weight = this.#suggestWeight(fields.categoryId, fields.name);
      this.#suggestedWeight = weight === null ? '' : String(weight);
      this.weight.set(this.#suggestedWeight);
      this.detailsDiffer.set(false);
      this.offerRows.set([]);
      this.#savedImagePaths.set([]);
      this.picking.set(true);
      return;
    }

    const products = value.colours.map((colour) => colour.product);
    const price = sharedPriceOf(anchor, products);
    const sizes = sharedSizesFrom(anchor, products);
    const description = plainFromHtml(anchor.descriptionHtml);
    const previousActive = this.activeColour()?.productId ?? anchor.id;
    this.#lastType = anchor.type;
    this.#lastSuggestedCategory = anchor.categoryId;
    this.#categoryPicked = false;
    this.#descriptionBaseline = description;
    this.#descriptionsDiffer = descriptionsDiffer(products);
    this.model.set({
      name: anchor.name,
      summary: anchor.summary ?? '',
      description,
      details: anchor.details.join('\n'),
      type: anchor.type,
      categoryId: anchor.categoryId,
      brandId: anchor.brandId,
      gender: anchor.gender ?? '',
      price: String(price.price),
      compareAtPrice: price.compareAtPrice === null ? '' : String(price.compareAtPrice),
    });
    this.sizes.set(sizes);
    const drafts = value.colours.map((colour) =>
      colourDraftFrom(colour.product, colour.version, sizes, price),
    );
    this.colours.set(drafts);
    this.activeIndex.set(
      Math.max(
        0,
        drafts.findIndex((draft) => draft.productId === previousActive),
      ),
    );
    this.tags.set([...(anchor.tags ?? [])]);
    this.selectedPlayers.set([...anchor.players]);
    this.marketingBadgeKind.set(anchor.marketingBadge?.kind ?? '');
    this.marketingBadgeStyle.set(anchor.marketingBadge?.style ?? 'plain');
    this.newArrivalUntilInput.set(
      isActiveNewArrival(anchor.newArrivalUntil)
        ? toDateInputValue(new Date(timestampToMs(anchor.newArrivalUntil)!))
        : '',
    );
    this.weight.set(typeof anchor.weightGrams === 'number' ? String(anchor.weightGrams) : '');
    this.detailsDiffer.set(sharedDetailsDiffer(products));
    this.offerRows.set(offerRowsFor(value.offers, products));
    this.#savedImagePaths.set(products.flatMap((product) => product.images.map((image) => image.path)));
  }

  #blockers(): string {
    const colours = this.colours();
    if (colours.length === 0) return 'Add the first colour of this product.';
    if (this.sizeError()) return this.sizeError();
    if (this.tagError()) return this.tagError();
    if (this.weightError()) return this.weightError();
    if (this.newArrivalError()) return this.newArrivalError();
    if (this.newArrivalChecked() && !parseDateInputValue(this.newArrivalUntilInput())) {
      return 'Choose a valid New arrival end date.';
    }
    const sizes = this.sizes();
    for (const [index, colour] of colours.entries()) {
      const name = this.colourName(colour);
      const problem = this.#colourBlocker(colour, name, sizes);
      if (problem) {
        this.activeIndex.set(index);
        return problem;
      }
    }
    return '';
  }

  #colourBlocker(colour: ColourDraft, name: string, sizes: readonly ModelSizeDraft[]): string {
    if (colour.published && colour.images.length < 1) {
      return `Add at least one photo of ${name} before showing it, or hide that colour.`;
    }
    if (colour.images.length > 8) return `Add up to 8 photos of ${name}.`;
    for (const image of colour.images) {
      const alt = image.alt.trim();
      if (alt.length < 1 || alt.length > 125) return 'Describe each photo in 125 characters or fewer.';
      if (!isSafeProductPath(image.path))
        return "One of the photos can't be saved. Remove it and add it again.";
    }
    if (this.ownPriceError(colour) || (colour.ownPrice && parseWholePounds(colour.price) === null)) {
      return `Enter a price for ${name} in whole pounds.`;
    }
    if (this.ownCompareError(colour)) return `The old price of ${name} must be higher than its price.`;
    if (sizes.length === 0) {
      return parseCount(colour.flatStock) === null ? `Enter the stock for ${name}.` : '';
    }
    const made = sizes.filter((size) => !colour.notMade.includes(size.key));
    if (made.length === 0) return `${name} needs at least one size it is made in.`;
    for (const size of made) {
      if (parseCount(colour.stock[size.key] ?? '') === null) {
        return `Enter the stock for ${name} in size ${size.label}.`;
      }
    }
    return '';
  }

  async #persist(): Promise<void> {
    this.isSaving.set(true);
    try {
      const result = await this.#admin.saveProductModel({
        anchorId: this.productId() ?? null,
        shared: this.#sharedPayload(),
        colours: this.colours().map((colour) => this.#colourPayload(colour)),
      });
      await this.#deleteUnkept();
      if (this.isCreate()) {
        this.#snackbar.success('Product created.');
        await this.#router.navigate(['/admin/products', result.anchorId], { replaceUrl: true });
        return;
      }
      this.#snackbar.success('Saved. Shoppers see it within a second.');
      this.#reloadTick.update((tick) => tick + 1);
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  async #deleteUnkept(): Promise<void> {
    const kept = this.colours().flatMap((colour) => colour.images.map((image) => image.path));
    try {
      await this.#uploads.deleteImages(this.#tracker.orphansOnDiscard(kept));
      this.#tracker.clear();
    } catch {
      // Session photos that were not kept stay in Storage.
    }
  }

  #sharedPayload(): ProductModelSharedPayload {
    const value = this.model();
    const price = parseWholePounds(asText(value.price)) ?? 0;
    const compareRaw = asText(value.compareAtPrice).trim();
    const descriptionText = asText(value.description).trim();
    // An untouched description is left out, so formatting from the old store stays on each colour.
    const sendDescription =
      this.isCreate() || this.#descriptionsDiffer || asText(value.description) !== this.#descriptionBaseline;
    const kind = this.marketingBadgeKind();
    const date = parseDateInputValue(this.newArrivalUntilInput());
    return {
      name: collapseSpaces(asText(value.name)),
      summary: asText(value.summary).trim() || null,
      ...(sendDescription ? { description: descriptionText.length === 0 ? null : descriptionText } : {}),
      details: detailLinesFromText(asText(value.details)),
      type: value.type,
      categoryId: value.categoryId.trim(),
      brandId: value.brandId.trim(),
      gender: value.gender === '' ? null : value.gender,
      // Only players still in the list; while the list hasn't loaded, leave the key out.
      ...(this.#playerList.hasValue()
        ? { players: this.selectedPlayers().filter((id) => this.#playerList.nameOf(id) !== null) }
        : {}),
      weightGrams: this.weight().trim().length === 0 ? null : parseWeightGrams(this.weight()),
      tags: this.tags(),
      marketingBadge: kind ? { kind, style: this.marketingBadgeStyle() } : null,
      newArrivalUntil: date
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString()
        : null,
      price,
      compareAtPrice: compareRaw.length === 0 ? null : parseWholePounds(compareRaw),
      sizes: this.sizes().map((size) =>
        size.id === undefined ? { label: size.label.trim() } : { id: size.id, label: size.label.trim() },
      ),
    };
  }

  #colourPayload(colour: ColourDraft): ProductModelColourPayload {
    const sizes = this.sizes();
    const compareRaw = colour.compareAtPrice.trim();
    return {
      productId: colour.productId,
      version: colour.version,
      colors: colour.colors,
      images: colour.images.map((image) => ({
        path: image.path,
        alt: image.alt.trim(),
        ...(typeof image.width === 'number' ? { width: image.width } : {}),
        ...(typeof image.height === 'number' ? { height: image.height } : {}),
      })),
      published: colour.published,
      ownPrice: colour.ownPrice
        ? {
            price: parseWholePounds(colour.price) ?? 0,
            compareAtPrice: compareRaw.length === 0 ? null : parseWholePounds(compareRaw),
          }
        : null,
      stock:
        sizes.length === 0
          ? [parseCount(colour.flatStock) ?? 0]
          : sizes.map((size) =>
              colour.notMade.includes(size.key) ? 0 : (parseCount(colour.stock[size.key] ?? '') ?? 0),
            ),
      made: sizes.map((size) => !colour.notMade.includes(size.key)),
    };
  }
}

function emptyFields(): SharedFields {
  const type = PRODUCT_TYPES[0].id;
  return {
    name: '',
    summary: '',
    description: '',
    details: '',
    type,
    categoryId: defaultCategoryForType(type),
    brandId: '',
    gender: '',
    price: '',
    compareAtPrice: '',
  };
}

/** Offers that cover this product: every colour, or the colours they cover. */
function offerRowsFor(offers: readonly Offer[], products: readonly Product[]): OfferRow[] {
  const rows: OfferRow[] = [];
  const nowMs = Date.now();
  for (const offer of offers) {
    if (offer.archived || !offer.active) continue;
    if (offer.schedule.startsAt && nowMs < offer.schedule.startsAt.getTime()) continue;
    if (offer.schedule.endsAt && nowMs >= offer.schedule.endsAt.getTime()) continue;
    const covered = products.filter((product) => offerMatch(offer, toPricedProduct(product)) !== 'none');
    if (covered.length === 0) continue;
    const scope =
      covered.length === products.length
        ? products.length === 1
          ? 'This product'
          : 'Every colour'
        : `${covered.map((product) => colourName(product.colors ?? [])).join(', ')} only`;
    rows.push({ id: offer.id, title: offer.title || offer.name, scope });
  }
  return rows;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'functions/not-found'
  );
}
