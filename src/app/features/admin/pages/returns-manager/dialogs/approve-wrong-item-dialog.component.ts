import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { SentPiecePickerComponent, type SentPiece } from '../components/sent-piece-picker.component';
import type { SentPieceChoice } from '../services/returns-admin.service';

export interface WrongItemToChoose {
  readonly itemIndex: number;
  readonly name: string;
  readonly detail: string;
}

export interface ApproveWrongItemDialogData {
  readonly ref: string;
  readonly items: readonly WrongItemToChoose[];
}

export interface ApproveWrongItemDialogResult {
  readonly sent: readonly SentPieceChoice[];
}

/** Approve for Wrong Item Sent: "What did we send instead?" for each wrong item (ATS-293). */
@Component({
  selector: 'app-approve-wrong-item-dialog',
  imports: [MatDialogModule, MatButtonModule, SentPiecePickerComponent],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">What Did We Send Instead?</h2>
    <mat-dialog-content>
      <div class="return-dialog-fields">
        <p class="font-body-md opacity-85">
          Pick the product and size the customer got by mistake. It comes out of stock now and goes back at
          Item Received.
        </p>
        @for (item of data.items; track item.itemIndex) {
          <section class="elements-start-col items-stretch! gap-4 border-t border-outline-variant pt-4">
            <p class="font-body-md">
              Ordered: <span class="font-bold! break-words">{{ item.name }}</span>
              @if (item.detail) {
                <span class="text-on-surface-variant"> · {{ item.detail }}</span>
              }
            </p>
            <app-sent-piece-picker (pieceChange)="set(item.itemIndex, $event)" />
          </section>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions class="catalog-dialog-actions">
      <button matButton="text" type="button" [mat-dialog-close]="undefined">Not Yet</button>
      <button matButton="filled" type="button" [disabled]="!complete()" (click)="save()">Approve</button>
    </mat-dialog-actions>
  `,
})
export class ApproveWrongItemDialogComponent {
  readonly data = inject<ApproveWrongItemDialogData>(MAT_DIALOG_DATA);
  readonly #ref =
    inject<MatDialogRef<ApproveWrongItemDialogComponent, ApproveWrongItemDialogResult>>(MatDialogRef);

  readonly #chosen = signal<Readonly<Record<number, SentPiece | null>>>({});
  readonly complete = computed(() => this.data.items.every((item) => !!this.#chosen()[item.itemIndex]));

  set(itemIndex: number, piece: SentPiece | null): void {
    this.#chosen.update((current) => ({ ...current, [itemIndex]: piece }));
  }

  save(): void {
    if (!this.complete()) return;
    const chosen = this.#chosen();
    this.#ref.close({
      sent: this.data.items.map((item) => ({ itemIndex: item.itemIndex, ...chosen[item.itemIndex]! })),
    });
  }
}
