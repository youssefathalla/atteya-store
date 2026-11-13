import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { OfferConditionGroup, OfferConditions } from '@core/services/offers/engine';
import { COLOR_PALETTE } from '@core/services/products/catalog-taxonomy';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  describeConditionGroup,
  readTargets,
  TARGET_FIELD_LABEL,
  targetName,
  writeTargets,
  type CatalogNames,
  type TargetTag,
} from '../../models/offer-admin.model';
import {
  ALL_COLOURS,
  colourChoiceValues,
  colourCountNote,
  groupOfferProducts,
  hasColourChoice,
  newProductPick,
  nextColourChoice,
  productPickLabel,
  readProductPicks,
  writeProductPicks,
  type OfferProductModel,
  type PickerColourInfo,
  type ProductPick,
} from '../../models/offer-product-picks';

/** Most options each group lists while searching. */
const MAX_OPTIONS = 8;
/** Most options each group lists before anything is typed (the list scrolls). */
const MAX_BROWSE_OPTIONS = 60;

const PALETTE = new Map<string, PickerColourInfo>(
  COLOR_PALETTE.map((entry) => [entry.id, { label: entry.label, swatch: entry.swatch }]),
);
const colourInfo = (colorId: string): PickerColourInfo | null => PALETTE.get(colorId) ?? null;

type TargetOption =
  | { readonly kind: 'tag'; readonly tag: TargetTag; readonly name: string; readonly note: null }
  | {
      readonly kind: 'product';
      readonly model: OfferProductModel;
      readonly name: string;
      readonly note: string | null;
    };

let nextId = 0;

/**
 * Include or Leave out on step 2 (and every other offer product picker): tags such as "Category
 * T-shirts" that save into the offer's condition groups (one "is one of" group per field), plus
 * groups that don't fit a tag shown as "Advanced rule" in plain words. A product shows once; when
 * it has several colours its tag gets a Colours dropdown (ATS-270).
 */
@Component({
  selector: 'app-product-targets',
  host: { class: 'block w-full' },
  imports: [
    ColorSwatchComponent,
    MatAutocompleteModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    SharedIconModule,
  ],
  templateUrl: './product-targets.component.html',
})
export class ProductTargetsComponent {
  readonly heading = input.required<string>();
  readonly addLabel = input.required<string>();
  readonly optional = input(false);
  readonly conditions = model.required<OfferConditions>();
  readonly categories = input<readonly Category[]>([]);
  readonly brands = input<readonly Brand[]>([]);
  readonly products = input.required<readonly Product[]>();
  readonly names = input.required<CatalogNames>();
  /** `products`: only products can be picked (the free item and free gift choices). */
  readonly kinds = input<'all' | 'products'>('all');
  /**
   * All colours saves every colour the product has today instead of its model (free gifts can
   * only name products), and a product with every colour picked reads as All colours.
   */
  readonly expandModels = input(false);

  readonly #injector = inject(Injector);
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly fieldLabel = TARGET_FIELD_LABEL;
  readonly allColours = ALL_COLOURS;
  readonly headingId = signal(`offer-targets-${nextId++}`).asReadonly();
  readonly picking = signal(false);
  readonly query = signal('');

  readonly view = computed(() => readTargets(this.conditions()));
  readonly models = computed(() => groupOfferProducts(this.products(), colourInfo));

  /** Category and brand tags. */
  readonly groupTags = computed(() =>
    this.view().tags.filter((tag) => tag.field === 'categoryIds' || tag.field === 'brandId'),
  );

  /** Picked products, one per product, colours grouped. */
  readonly picks = computed(() => {
    const tags = this.view().tags;
    const values = (field: 'modelGroup' | 'productId'): string[] =>
      tags.filter((tag) => tag.field === field).map((tag) => tag.value);
    return readProductPicks(
      { modelGroups: values('modelGroup'), productIds: values('productId') },
      this.models(),
      this.expandModels(),
    );
  });

  /** Products with one colour (or no longer found): a plain tag. */
  readonly plainPicks = computed(() => this.picks().filter((pick) => !hasColourChoice(pick.model)));
  /** Products with several colours: a tag with a Colours dropdown. */
  readonly colourPicks = computed(() => this.picks().filter((pick) => hasColourChoice(pick.model)));

  /** Anything for the plain tag row: categories, brands, one-colour products or advanced rules. */
  readonly hasPlainTags = computed(
    () => this.groupTags().length > 0 || this.plainPicks().length > 0 || this.view().advanced.length > 0,
  );

  readonly searchLabel = computed(() =>
    this.kinds() === 'products' ? 'Search products' : 'Search categories, brands and products',
  );

  readonly options = computed(() => {
    const query = this.query().trim().toLowerCase();
    const limit = query ? MAX_OPTIONS : MAX_BROWSE_OPTIONS;
    const chosen = new Set(this.groupTags().map((tag) => `${tag.field}:${tag.value}`));
    const pickedModels = new Set(this.picks().flatMap((pick) => (pick.model ? [pick.model.key] : [])));
    const pickTags = (
      field: 'categoryIds' | 'brandId',
      items: readonly { id: string; name: string }[],
    ): TargetOption[] => {
      const result: TargetOption[] = [];
      for (const item of items) {
        if (result.length >= limit) break;
        if (chosen.has(`${field}:${item.id}`)) continue;
        if (query && !item.name.toLowerCase().includes(query)) continue;
        result.push({ kind: 'tag', tag: { field, value: item.id }, name: item.name, note: null });
      }
      return result;
    };
    const pickProducts = (): TargetOption[] => {
      const result: TargetOption[] = [];
      for (const item of this.models()) {
        if (result.length >= limit) break;
        if (pickedModels.has(item.key)) continue;
        if (query && !item.name.toLowerCase().includes(query)) continue;
        result.push({ kind: 'product', model: item, name: item.name, note: colourCountNote(item) });
      }
      return result;
    };
    const groups =
      this.kinds() === 'products'
        ? [{ label: 'Products', options: pickProducts() }]
        : [
            { label: 'Categories', options: pickTags('categoryIds', this.categories()) },
            { label: 'Brands', options: pickTags('brandId', this.brands()) },
            { label: 'Products', options: pickProducts() },
          ];
    return groups.filter((group) => group.options.length > 0);
  });

  /** The picker input stays empty after a pick. */
  readonly emptyDisplay = (): string => '';

  optionKey(option: TargetOption): string {
    return option.kind === 'tag' ? `${option.tag.field}:${option.tag.value}` : option.model.key;
  }

  nameOf(tag: TargetTag): string {
    return targetName(tag, this.names());
  }

  pickLabel(pick: ProductPick): string {
    return productPickLabel(pick);
  }

  colourValues(pick: ProductPick): readonly string[] {
    return colourChoiceValues(pick);
  }

  describe(group: OfferConditionGroup): string {
    return describeConditionGroup(group, this.names());
  }

  openPicker(): void {
    this.picking.set(true);
    this.query.set('');
    afterNextRender(() => this.searchInput()?.nativeElement.focus(), { injector: this.#injector });
  }

  closePicker(): void {
    this.picking.set(false);
    this.query.set('');
  }

  onPicked(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as TargetOption | null;
    if (!option) return;
    if (option.kind === 'tag') {
      this.#save([...this.groupTags(), option.tag], this.picks());
    } else {
      this.#save(this.groupTags(), [...this.picks(), newProductPick(option.model)]);
    }
    this.query.set('');
    const inputEl = this.searchInput()?.nativeElement;
    if (inputEl) inputEl.value = '';
  }

  removeTag(tag: TargetTag): void {
    this.#save(
      this.groupTags().filter((item) => item.field !== tag.field || item.value !== tag.value),
      this.picks(),
    );
  }

  removePick(pick: ProductPick): void {
    this.#save(
      this.groupTags(),
      this.picks().filter((item) => item.key !== pick.key),
    );
  }

  onColoursChange(pick: ProductPick, selected: readonly string[]): void {
    this.#save(
      this.groupTags(),
      this.picks().map((item) => (item.key === pick.key ? nextColourChoice(item, selected) : item)),
    );
  }

  removeAdvanced(index: number): void {
    const view = this.view();
    this.conditions.set(writeTargets({ ...view, advanced: view.advanced.filter((_, at) => at !== index) }));
  }

  #save(groupTags: readonly TargetTag[], picks: readonly ProductPick[]): void {
    const saved = writeProductPicks(picks, this.expandModels());
    const tags: TargetTag[] = [
      ...groupTags,
      ...saved.modelGroups.map((value) => ({ field: 'modelGroup' as const, value })),
      ...saved.productIds.map((value) => ({ field: 'productId' as const, value })),
    ];
    this.conditions.set(writeTargets({ tags, advanced: this.view().advanced }));
  }
}
