import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { SIZE_UNIT_NAMES, type SizeGuide, type SizeGuideId, type SizeUnit } from '../../utils/size-guide';

/** Size charts for the product page's Size & Fit section, with a chart switch and a unit switch. */
@Component({
  selector: 'app-size-guide',
  imports: [MatButtonToggleModule],
  templateUrl: './size-guide.component.html',
  host: { class: 'block w-full' },
})
export class SizeGuideComponent {
  /** The product's charts; a switch picks one when there are several. */
  readonly guides = input.required<readonly SizeGuide[]>();

  readonly unitNames = SIZE_UNIT_NAMES;

  readonly guideId = linkedSignal<readonly SizeGuide[], SizeGuideId | null>({
    source: this.guides,
    computation: (guides, previous) =>
      guides.some((guide) => guide.id === previous?.value) ? previous!.value : (guides[0]?.id ?? null),
  });

  readonly guide = computed(() => this.guides().find((guide) => guide.id === this.guideId()) ?? null);

  /** Last unit the shopper picked: kept when they switch to another chart that offers it. */
  readonly #pickedUnit = signal<SizeUnit>('cm');

  /** The picked unit when this chart has it, else the chart's own (weight charts are in kilograms). */
  readonly unit = computed<SizeUnit>(() => {
    const units = this.guide()?.units ?? [];
    const picked = this.#pickedUnit();
    return units.includes(picked) ? picked : (units[0] ?? 'cm');
  });

  readonly unitWord = computed(() => SIZE_UNIT_NAMES[this.unit()].word);

  pickUnit(unit: SizeUnit): void {
    this.#pickedUnit.set(unit);
  }
}
