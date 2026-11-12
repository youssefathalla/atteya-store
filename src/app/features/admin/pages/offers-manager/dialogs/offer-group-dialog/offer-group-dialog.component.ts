import { Component, inject, type Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import type { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { OfferCardComponent } from '../../components/offer-card/offer-card.component';
import type { OfferCardView } from '../../models/offer-admin.model';

/** What a card's buttons do; the Offers page passes its own actions in. */
export interface OfferCardActions {
  readonly isBusy: (card: OfferCardView) => boolean;
  readonly switched: (card: OfferCardView, event: MatSlideToggleChange) => void;
  readonly duplicate: (card: OfferCardView) => void;
  readonly pauseResume: (card: OfferCardView) => void;
  readonly archive: (card: OfferCardView) => void;
  readonly remove: (card: OfferCardView) => void;
}

export interface OfferGroupDialogData {
  /** The group's internal name. */
  readonly name: string;
  /** One card per offer in the group; live, so switches update in place. */
  readonly cards: Signal<readonly OfferCardView[]>;
  readonly actions: OfferCardActions;
}

/** Open Group: each offer of a grouped card with its own switch, Edit and ⋯ menu (ATS-219). */
@Component({
  selector: 'app-offer-group-dialog',
  imports: [MatDialogModule, MatButtonModule, OfferCardComponent],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">{{ data.name }}</h2>
    <mat-dialog-content>
      @if (data.cards().length === 0) {
        <p class="font-body-md">These offers are no longer in this list.</p>
      } @else {
        <div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 items-stretch py-1">
          @for (card of data.cards(); track card.key) {
            <app-offer-card
              [card]="card"
              [busy]="data.actions.isBusy(card)"
              (switched)="data.actions.switched(card, $event)"
              (duplicate)="data.actions.duplicate(card)"
              (pauseResume)="data.actions.pauseResume(card)"
              (archive)="data.actions.archive(card)"
              (remove)="data.actions.remove(card)"
            />
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="px-6 pb-4">
      <button matButton="text" type="button" mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
})
export class OfferGroupDialogComponent {
  readonly data = inject<OfferGroupDialogData>(MAT_DIALOG_DATA);
}
