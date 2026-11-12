import { Component, input } from '@angular/core';
import { SkeletonComponent } from '@shared/ui/skeleton';

/**
 * Placeholder the size of a choice box (Gift Box, Bundle price steps, Bundle & Save) while its
 * products load, server render included, so nothing moves when the real box appears.
 */
@Component({
  selector: 'app-choice-box-skeleton',
  imports: [SkeletonComponent],
  template: `
    <div class="pdp-gift-box" aria-hidden="true">
      @if (header()) {
        <app-skeleton class="h-12 w-full" />
      }
      <div class="elements-start-col gap-2 p-4">
        <app-skeleton class="h-5 w-32" />
        <div class="scroll-row pdp-gift-row">
          @for (n of [1, 2, 3]; track n) {
            <div class="pdp-gift-card">
              <app-skeleton class="pdp-gift-card__photo" />
              <span class="pdp-gift-card__caption"><app-skeleton class="h-10 w-full" /></span>
            </div>
          }
        </div>
        @if (button()) {
          <app-skeleton class="h-12 w-full" />
        }
      </div>
    </div>
  `,
  host: { class: 'block w-full' },
})
export class ChoiceBoxSkeletonComponent {
  /** The black header bar (Gift Box, Bundle & Save). */
  readonly header = input<boolean>(false);
  /** A full-width button at the bottom (Bundle & Save's Add Bundle to Bag). */
  readonly button = input<boolean>(false);
}
