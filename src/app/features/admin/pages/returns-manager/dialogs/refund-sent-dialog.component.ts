import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { REFUND_REFERENCE_MAX as REFERENCE_MAX } from '@core/config/returns';

export interface RefundSentDialogData {
  readonly ref: string;
  readonly refundEgp: number;
  /** "EGP 1,250". */
  readonly refundLabel: string;
  /** What the refunded items cost: the most the server accepts. */
  readonly itemsEgp: number;
  /** The InstaPay number or address the customer gave. */
  readonly refundTo: string | null;
}

export interface RefundSentDialogResult {
  readonly amountEgp: number;
  readonly reference: string | null;
}

/** Refund Sent (admin only): the amount sent by InstaPay and an optional reference (ATS-293). */
@Component({
  selector: 'app-refund-sent-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">Refund Sent for {{ data.ref }}</h2>
    <form (submit)="$event.preventDefault(); save()">
      <mat-dialog-content>
        <div class="return-dialog-fields">
          @if (data.refundTo; as to) {
            <p class="font-body-md">
              Send to: <span class="font-bold! break-all" dir="auto">{{ to }}</span>
            </p>
          }
          <mat-form-field class="w-full" appearance="outline">
            <mat-label>Amount sent (EGP)</mat-label>
            <input
              matInput
              type="number"
              inputmode="numeric"
              [attr.min]="nothingToSend ? 0 : 1"
              step="1"
              required
              [value]="amount()"
              (input)="amount.set($any($event.target).value)"
            />
            @if (nothingToSend) {
              <mat-hint>The courier fee covers the items, so there is nothing to send. Save EGP 0.</mat-hint>
            } @else if (amountValid()) {
              <mat-hint>The refund total is {{ data.refundLabel }}.</mat-hint>
            } @else {
              <mat-hint>Write the amount in whole pounds, up to what the items cost.</mat-hint>
            }
          </mat-form-field>
          <mat-form-field class="w-full" appearance="outline">
            <mat-label>InstaPay reference (optional)</mat-label>
            <input
              matInput
              [attr.maxlength]="referenceMax"
              [value]="reference()"
              (input)="reference.set($any($event.target).value)"
            />
            <mat-hint>Only staff see this.</mat-hint>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions class="catalog-dialog-actions">
        <button matButton="text" type="button" [mat-dialog-close]="undefined">Not Yet</button>
        <button matButton="filled" type="submit" [disabled]="!amountValid()">Refund Sent</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class RefundSentDialogComponent {
  readonly data = inject<RefundSentDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<RefundSentDialogComponent, RefundSentDialogResult>>(MatDialogRef);

  readonly referenceMax = REFERENCE_MAX;
  readonly nothingToSend = this.data.refundEgp <= 0;
  readonly amount = signal(String(this.data.refundEgp));
  readonly reference = signal('');
  readonly #amountEgp = computed(() => Number(this.amount()));
  readonly amountValid = computed(() => {
    const value = this.#amountEgp();
    if (!Number.isInteger(value)) return false;
    // Nothing to send (the courier fee was at least the items): EGP 0 closes the request.
    if (this.nothingToSend) return value === 0;
    return value >= 1 && value <= this.data.itemsEgp;
  });

  save(): void {
    if (!this.amountValid()) return;
    const reference = this.reference().trim().slice(0, REFERENCE_MAX);
    this.#ref.close({ amountEgp: this.#amountEgp(), reference: reference || null });
  }
}
