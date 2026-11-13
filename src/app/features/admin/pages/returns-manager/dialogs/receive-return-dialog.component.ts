import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

export interface ReceivePiece {
  readonly itemIndex: number;
  readonly name: string;
  readonly detail: string;
  readonly quantity: number;
  /** Damaged Item: off by default. */
  readonly damaged: boolean;
  /** Wrong Item Sent: no switch, the piece always goes back. */
  readonly wrongItem: boolean;
}

export interface ReceiveReturnDialogData {
  readonly ref: string;
  readonly pieces: readonly ReceivePiece[];
}

export interface ReceiveReturnDialogResult {
  readonly sellable: readonly { readonly itemIndex: number; readonly canBeSoldAgain: boolean }[];
}

/** Item Received: one Can be sold again switch per returned piece (ATS-293). */
@Component({
  selector: 'app-receive-return-dialog',
  imports: [MatDialogModule, MatButtonModule, MatSlideToggleModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">Item Received for {{ data.ref }}</h2>
    <mat-dialog-content>
      <div class="return-dialog-fields">
        <p class="font-body-md opacity-85">Pieces you can sell again go back into stock now.</p>
        <ul class="elements-start-col items-stretch! gap-4 w-full">
          @for (piece of data.pieces; track piece.itemIndex) {
            <li class="elements-between gap-4 border-t border-outline-variant pt-4">
              <span class="elements-start-col min-w-0">
                <span class="font-body-md font-bold! break-words"
                  >{{ piece.name }} × {{ piece.quantity }}</span
                >
                <span class="font-label-md text-on-surface-variant break-words">{{ piece.detail }}</span>
              </span>
              @if (piece.wrongItem) {
                <span class="font-label-md shrink-0">Goes back into stock</span>
              } @else {
                <mat-slide-toggle
                  [checked]="sellable()[piece.itemIndex]"
                  (change)="set(piece.itemIndex, $event.checked)"
                  >Can be sold again</mat-slide-toggle
                >
              }
            </li>
          }
        </ul>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions class="catalog-dialog-actions">
      <button matButton="text" type="button" [mat-dialog-close]="undefined">Not Yet</button>
      <button matButton="filled" type="button" (click)="save()">Item Received</button>
    </mat-dialog-actions>
  `,
})
export class ReceiveReturnDialogComponent {
  readonly data = inject<ReceiveReturnDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<ReceiveReturnDialogComponent, ReceiveReturnDialogResult>>(MatDialogRef);

  readonly sellable = signal<Record<number, boolean>>(
    Object.fromEntries(this.data.pieces.map((piece) => [piece.itemIndex, !piece.damaged])),
  );

  set(itemIndex: number, value: boolean): void {
    this.sellable.update((current) => ({ ...current, [itemIndex]: value }));
  }

  save(): void {
    const chosen = this.sellable();
    this.#ref.close({
      sellable: this.data.pieces
        .filter((piece) => !piece.wrongItem)
        .map((piece) => ({ itemIndex: piece.itemIndex, canBeSoldAgain: chosen[piece.itemIndex] ?? false })),
    });
  }
}
