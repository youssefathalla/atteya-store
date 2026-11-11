import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import type { SizeGuide, SizeGuideId, SizeUnit } from '../../utils/size-guide';

/** Size chart for the product page's Size & Fit section. */
@Component({
  selector: 'app-size-guide',
  imports: [MatButtonToggleModule, HorizontalScrollDirective],
  templateUrl: './size-guide.component.html',
  host: { class: 'block w-full' },
})
export class SizeGuideComponent {
  /** One chart, or men's and women's with a switch between them. */
  readonly guides = input.required<readonly SizeGuide[]>();

  readonly unit = signal<SizeUnit>('cm');

  readonly guideId = linkedSignal<readonly SizeGuide[], SizeGuideId | null>({
    source: this.guides,
    computation: (guides, previous) =>
      guides.some((guide) => guide.id === previous?.value) ? previous!.value : (guides[0]?.id ?? null),
  });

  readonly guide = computed(() => this.guides().find((guide) => guide.id === this.guideId()) ?? null);

  readonly unitLabel = computed(() => (this.unit() === 'cm' ? 'centimetres' : 'inches'));

  /** "Your body measurements in centimetres." or, with shirt and weight rows, "Measurements in …". */
  readonly intro = computed(
    () => `${this.guide()?.hasExtraRows ? 'Measurements' : 'Your body measurements'} in ${this.unitLabel()}.`,
  );
}
