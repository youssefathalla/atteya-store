import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { offerNoteText } from '@core/services/cart/bag-offer-notes';
import { BagOfferNotesService } from '@core/services/cart/bag-offer-notes.service';
import { SharedIconModule } from '@shared/ui/mat-icon';

/**
 * The notes above the bag's items and checkout's summary: one per offer that stopped applying
 * during this visit ("The Autumn Sale offer has ended, so your total changed."), each closed with
 * ✕. Renders nothing when there are none.
 */
@Component({
  selector: 'app-bag-offer-notes',
  imports: [MatButtonModule, SharedIconModule],
  host: { class: 'block w-full' },
  // The live region stays in the page, so a note that appears later is read out.
  template: `
    <div aria-live="polite">
      @if (notes().length > 0) {
        <ul class="space-y-2" [class]="spacing()">
          @for (note of notes(); track note.offerId) {
            <li class="offer-note">
              <span class="py-2">{{ note.text }}</span>
              <button matIconButton type="button" (click)="dismiss(note.offerId)" aria-label="Dismiss">
                <mat-icon name="close" />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class BagOfferNotesComponent {
  readonly #notes = inject(BagOfferNotesService);

  /** Extra classes on the list when it shows (its margins), so no gap is left when it is empty. */
  readonly spacing = input('');

  readonly notes = computed(() =>
    this.#notes.offerNotes().map((note) => ({ offerId: note.offerId, text: offerNoteText(note) })),
  );

  dismiss(offerId: string): void {
    this.#notes.dismiss(offerId);
  }
}
