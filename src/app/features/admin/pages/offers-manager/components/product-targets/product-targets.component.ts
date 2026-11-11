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
import type { OfferConditionGroup, OfferConditions } from '@core/services/offers/engine';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  describeConditionGroup,
  readTargets,
  TARGET_FIELD_LABEL,
  targetName,
  writeTargets,
  type CatalogNames,
  type TargetField,
  type TargetTag,
} from '../../models/offer-admin.model';

/** Most options each picker group lists while searching. */
const MAX_OPTIONS = 8;

interface TargetOption extends TargetTag {
  readonly name: string;
}

let nextId = 0;

/**
 * Include or Leave out on step 2: tags such as "Category T-shirts" that save into the offer's
 * condition groups (one "is one of" group per field), plus groups that don't fit a tag shown as
 * "Advanced rule" in plain words.
 */
@Component({
  selector: 'app-product-targets',
  host: { class: 'block w-full' },
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    SharedIconModule,
  ],
  templateUrl: './product-targets.component.html',
})
export class ProductTargetsComponent {
  readonly heading = input.required<string>();
  readonly addLabel = input.required<string>();
  readonly optional = input(false);
  readonly conditions = model.required<OfferConditions>();
  readonly categories = input.required<readonly Category[]>();
  readonly brands = input.required<readonly Brand[]>();
  readonly products = input.required<readonly Product[]>();
  readonly names = input.required<CatalogNames>();

  readonly #injector = inject(Injector);
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly fieldLabel = TARGET_FIELD_LABEL;
  readonly headingId = signal(`offer-targets-${nextId++}`).asReadonly();
  readonly picking = signal(false);
  readonly query = signal('');

  readonly view = computed(() => readTargets(this.conditions()));

  readonly options = computed(() => {
    const query = this.query().trim().toLowerCase();
    const chosen = new Set(this.view().tags.map((tag) => `${tag.field}:${tag.value}`));
    const pick = (field: TargetField, items: readonly { id: string; name: string }[]): TargetOption[] => {
      const result: TargetOption[] = [];
      for (const item of items) {
        if (result.length >= MAX_OPTIONS) break;
        if (chosen.has(`${field}:${item.id}`)) continue;
        if (query && !item.name.toLowerCase().includes(query)) continue;
        result.push({ field, value: item.id, name: item.name });
      }
      return result;
    };
    return [
      { label: 'Categories', options: pick('categoryIds', this.categories()) },
      { label: 'Brands', options: pick('brandId', this.brands()) },
      { label: 'Products', options: query ? pick('productId', this.products()) : [] },
    ].filter((group) => group.options.length > 0);
  });

  /** The picker input stays empty after a pick. */
  readonly emptyDisplay = (): string => '';

  nameOf(tag: TargetTag): string {
    return targetName(tag, this.names());
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
    const view = this.view();
    this.conditions.set(
      writeTargets({ ...view, tags: [...view.tags, { field: option.field, value: option.value }] }),
    );
    this.query.set('');
    const inputEl = this.searchInput()?.nativeElement;
    if (inputEl) inputEl.value = '';
  }

  removeTag(tag: TargetTag): void {
    const view = this.view();
    this.conditions.set(
      writeTargets({
        ...view,
        tags: view.tags.filter((item) => item.field !== tag.field || item.value !== tag.value),
      }),
    );
  }

  removeAdvanced(index: number): void {
    const view = this.view();
    this.conditions.set(writeTargets({ ...view, advanced: view.advanced.filter((_, at) => at !== index) }));
  }
}
