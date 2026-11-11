import { Component, input, output } from '@angular/core';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { OFFER_EDITOR_STEPS, type OfferEditorStep } from '../../models/offer-admin.model';

/**
 * The step bar of the offer editor, drawn as a timeline (a column on phone, a row from `sm`):
 * only the current step is filled black and bold, a finished step is a black outline with a tick
 * that links back to it, later steps are grey outlines, and a line joins each step to the next
 * (black after a finished step).
 */
@Component({
  selector: 'app-editor-steps',
  host: { class: 'block w-full' },
  imports: [SharedIconModule],
  template: `
    <nav aria-label="Offer steps">
      <ol class="offer-steps">
        @for (step of steps; track step.id) {
          <li class="offer-steps__item" [class.offer-steps__item--done]="done().includes(step.id)">
            @if (step.id === current()) {
              <span class="offer-steps__circle offer-steps__circle--on" aria-hidden="true">{{
                step.id
              }}</span>
              <span class="font-bold!" aria-current="step">{{ step.label }}</span>
            } @else if (done().includes(step.id)) {
              <button type="button" class="offer-steps__link" (click)="stepClick.emit(step.id)">
                <span class="offer-steps__circle offer-steps__circle--done" aria-hidden="true">
                  <mat-icon name="check" />
                </span>
                <span>{{ step.label }}</span>
                <span class="sr-only">(done)</span>
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
  /** Steps shown as finished (links). */
  readonly done = input.required<readonly OfferEditorStep[]>();
  readonly stepClick = output<OfferEditorStep>();

  readonly steps = OFFER_EDITOR_STEPS;
}
