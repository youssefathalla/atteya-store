import { Component, computed, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type {
  OfferConditionAtom,
  OfferConditionField,
  OfferConditionGroup,
  OfferConditions,
  OfferPriceAtom,
  OfferSetAtom,
} from '@core/services/offers/engine';
import { COLOR_PALETTE } from '@core/services/products/catalog-taxonomy';
import { PRODUCT_TYPES, SIZE_ORDER } from '@core/services/products/product.constants';
import type { Brand, Category, Product } from '@core/services/products/product.model';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { CONDITION_FIELD_OPTIONS } from '../../models/offer-admin.model';
import { groupOfferProducts, hasColourChoice } from '../../models/offer-product-picks';

export interface ValueChoice {
  readonly id: string;
  readonly label: string;
  readonly swatch?: string;
}

@Component({
  selector: 'app-condition-group-editor',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    SharedIconModule,
    ColorSwatchComponent,
  ],
  templateUrl: './condition-group-editor.component.html',
})
export class ConditionGroupEditorComponent {
  readonly heading = input.required<string>();
  readonly hint = input('');
  readonly conditions = model.required<OfferConditions>();
  readonly brands = input.required<readonly Brand[]>();
  readonly categories = input.required<readonly Category[]>();
  readonly products = input.required<readonly Product[]>();

  readonly fieldOptions = CONDITION_FIELD_OPTIONS;

  /** Products grouped by model, so a colour shows under its product's name (ATS-270). */
  readonly #models = computed(() =>
    groupOfferProducts(this.products(), (colorId) => {
      const entry = COLOR_PALETTE.find((colour) => colour.id === colorId);
      return entry ? { label: entry.label, swatch: entry.swatch } : null;
    }),
  );

  /** One choice per product with a model, named after the product. */
  readonly modelGroups = computed<readonly ValueChoice[]>(() =>
    this.#models()
      .flatMap((item) => (item.modelGroup ? [{ id: item.modelGroup, label: item.name }] : []))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  /** One choice per colour: "Nox Padel Shorts · Black" when the product has several colours. */
  readonly productChoices = computed<readonly ValueChoice[]>(() =>
    this.#models()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((item) =>
        item.colours.map((colour) => ({
          id: colour.productId,
          label: hasColourChoice(item) ? `${item.name} · ${colour.label}` : item.name,
        })),
      ),
  );

  readonly existingTags = computed<readonly ValueChoice[]>(() => {
    const tags = new Set<string>();
    for (const p of this.products()) {
      for (const tag of p.tags ?? []) tags.add(tag);
    }
    return Array.from(tags)
      .sort()
      .map((id) => ({ id, label: id }));
  });

  choicesForField(field: OfferConditionField): readonly ValueChoice[] {
    switch (field) {
      case 'brandId':
        return this.brands().map((b) => ({ id: b.id, label: b.name }));
      case 'categoryIds':
        return this.categories().map((c) => ({
          id: c.id,
          label: c.depth === 1 ? `\u2014 ${c.name}` : c.name,
        }));
      case 'type':
        return PRODUCT_TYPES.map((t) => ({ id: t.id, label: t.label }));
      case 'colors':
        return COLOR_PALETTE.map((c) => ({ id: c.id, label: c.label, swatch: c.swatch }));
      case 'sizes':
        return SIZE_ORDER.map((s) => ({ id: s, label: s }));
      case 'modelGroup':
        return this.modelGroups();
      case 'tags':
        return this.existingTags();
      case 'productId':
        return this.productChoices();
      case 'price':
        return [];
    }
  }

  addGroup(): void {
    const groups = this.conditions().anyOf;
    if (groups.length >= 10) return;
    const nextGroup: OfferConditionGroup = {
      allOf: [{ field: 'brandId', in: [] }],
    };
    this.conditions.set({ anyOf: [...groups, nextGroup] });
  }

  removeGroup(groupIndex: number): void {
    const groups = this.conditions().anyOf.filter((_, i) => i !== groupIndex);
    this.conditions.set({ anyOf: groups });
  }

  addAtom(groupIndex: number): void {
    this.#updateGroup(groupIndex, (group) => {
      if (group.allOf.length >= 10) return group;
      return { allOf: [...group.allOf, { field: 'categoryIds', in: [] }] };
    });
  }

  removeAtom(groupIndex: number, atomIndex: number): void {
    this.#updateGroup(groupIndex, (group) => ({
      allOf: group.allOf.filter((_, i) => i !== atomIndex),
    }));
  }

  onFieldChange(groupIndex: number, atomIndex: number, field: OfferConditionField): void {
    const nextAtom: OfferConditionAtom = field === 'price' ? { field: 'price' } : { field, in: [] };
    this.#replaceAtom(groupIndex, atomIndex, nextAtom);
  }

  atomMode(atom: OfferConditionAtom): 'in' | 'notIn' {
    if (atom.field === 'price') return 'in';
    return atom.notIn ? 'notIn' : 'in';
  }

  onModeChange(
    groupIndex: number,
    atomIndex: number,
    atom: OfferConditionAtom,
    picked: 'in' | 'notIn',
  ): void {
    if (atom.field === 'price') return;
    const mode = picked === 'notIn' ? 'notIn' : 'in';
    const values = atom.in ?? atom.notIn ?? [];
    const nextAtom: OfferSetAtom =
      mode === 'notIn' ? { field: atom.field, notIn: values } : { field: atom.field, in: values };
    this.#replaceAtom(groupIndex, atomIndex, nextAtom);
  }

  hasValue(atom: OfferConditionAtom, value: string): boolean {
    if (atom.field === 'price') return false;
    const list = atom.in ?? atom.notIn ?? [];
    return list.includes(value);
  }

  toggleValue(groupIndex: number, atomIndex: number, atom: OfferConditionAtom, value: string): void {
    if (atom.field === 'price') return;
    const mode = atom.notIn ? 'notIn' : 'in';
    const current = atom.in ?? atom.notIn ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value].slice(0, 200);
    const nextAtom: OfferSetAtom =
      mode === 'notIn' ? { field: atom.field, notIn: next } : { field: atom.field, in: next };
    this.#replaceAtom(groupIndex, atomIndex, nextAtom);
  }

  onPriceChange(
    groupIndex: number,
    atomIndex: number,
    atom: OfferConditionAtom,
    bound: 'min' | 'max',
    event: Event,
  ): void {
    if (atom.field !== 'price') return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const parsed = Number.parseInt(target.value, 10);
    const num = Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    const nextAtom: OfferPriceAtom = {
      field: 'price',
      min: bound === 'min' ? num : atom.min,
      max: bound === 'max' ? num : atom.max,
    };
    this.#replaceAtom(groupIndex, atomIndex, nextAtom);
  }

  #replaceAtom(groupIndex: number, atomIndex: number, nextAtom: OfferConditionAtom): void {
    this.#updateGroup(groupIndex, (group) => ({
      allOf: group.allOf.map((item, idx) => (idx === atomIndex ? nextAtom : item)),
    }));
  }

  #updateGroup(groupIndex: number, updater: (group: OfferConditionGroup) => OfferConditionGroup): void {
    const nextGroups = this.conditions()
      .anyOf.map((group, idx) => (idx === groupIndex ? updater(group) : group))
      .filter((group) => group.allOf.length > 0);
    this.conditions.set({ anyOf: nextGroups });
  }
}
