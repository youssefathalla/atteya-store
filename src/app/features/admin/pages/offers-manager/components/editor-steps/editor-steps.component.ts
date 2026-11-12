import { Component, input, output } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { OFFER_EDITOR_STEPS, type OfferEditorStep } from '../../models/offer-admin.model';

/**
 * The step bar of the offer editor, drawn as a timeline (a column on phone, a row from `sm`).
 * The look follows the position only: every step before the current one has a tick (filled
 * black) and links back to it, the current step shows its number filled black, and every step
 * after it stays a grey outline with its number, even when it was visited already (editing an
 * existing offer) — then it is still a link, just not ticked. The line after a ticked step is black.
 */
@Component({
  selector: 'app-editor-steps',
  host: { class: 'block w-full' },
  imports: [SharedIconModule],
  template: `
    <nav aria-label="Offer steps">
      <ol class="offer-steps">
        @for (step of steps; track step.id) {
          <li class="offer-steps__item" [class.offer-steps__item--done]="step.id < current()">
            @if (step.id === current()) {
              <span class="offer-steps__circle offer-steps__circle--on" aria-hidden="true">{{
                step.id
              }}</span>
              <span class="font-bold!" aria-current="step">{{ step.label }}</span>
            } @else if (step.id < current()) {
              <button type="button" class="offer-steps__link" (click)="stepClick.emit(step.id)">
                <span class="offer-steps__circle offer-steps__circle--done" aria-hidden="true">
                  <mat-icon name="check" />
                </span>
                <span>{{ step.label }}</span>
                <span class="sr-only">(done)</span>
              </button>
            } @else if (done().includes(step.id)) {
              <button type="button" class="offer-steps__link" (click)="stepClick.emit(step.id)">
                <span class="offer-steps__circle" aria-hidden="true">{{ step.id }}</span>
                <span class="text-on-surface-variant">{{ step.label }}</span>
              </button>
            } @else {
              <span class="offer-steps__circle" aria-hidden="true">{{ step.id }}</span>
              <span class="text-on-surface-variant">{{ step.label }}</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class EditorStepsComponent {
  readonly current = input.required<OfferEditorStep>();
  /** Steps already visited: a step after the current one stays a link but is not ticked. */
  readonly done = input.required<readonly OfferEditorStep[]>();
  readonly stepClick = output<OfferEditorStep>();

  readonly steps = OFFER_EDITOR_STEPS;
}
