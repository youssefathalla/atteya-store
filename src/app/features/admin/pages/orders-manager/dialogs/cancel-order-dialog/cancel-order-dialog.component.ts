import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CANCEL_REASON_MAX } from '@core/config/order-status';

export interface CancelOrderDialogData {
  /** `#A1B2C3`. */
  readonly orderRef: string;
  /** True when the items were taken out of stock (they go back on cancel). */
  readonly stockTaken: boolean;
  /** Confirmed already: the payment or delivery fee may have been received. */
  readonly confirmed: boolean;
}

/** What Cancel Order closes with: the reason, trimmed ('' = none). Keep Order closes with nothing. */
export interface CancelOrderDialogResult {
  readonly reason: string;
}

/** Asks before cancelling an order, with an optional staff-only reason. */
@Component({
  selector: 'app-cancel-order-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">Cancel order {{ data.orderRef }}?</h2>
    <form (submit)="$event.preventDefault(); save()">
      <mat-dialog-content class="elements-start-col gap-3">
        <p class="font-body-md opacity-85">
          {{
            data.stockTaken
              ? 'The items go back into stock.'
              : "Nothing was taken out of stock, so there's nothing to put back."
          }}
          No email is sent; message the shopper on WhatsApp if needed.
        </p>
        @if (data.confirmed) {
          <p class="font-body-md">
            This order is confirmed, so the shopper may have paid already. Send their money back yourself; the
            dashboard doesn't refund it.
          </p>
        }
        <mat-form-field class="w-full" subscriptSizing="dynamic" appearance="outline">
          <mat-label>Reason (optional)</mat-label>
          <textarea
            matInput
            rows="3"
            [attr.maxlength]="max"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          ></textarea>
          <mat-hint>Only staff see this. {{ length() }} / {{ max }}</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end" class="gap-2 px-6 pb-4">
        <button matButton="text" type="button" [mat-dialog-close]="undefined">Keep Order</button>
        <button matButton="filled" theme="error" type="submit">Cancel Order</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class CancelOrderDialogComponent {
  readonly data = inject<CancelOrderDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<CancelOrderDialogComponent, CancelOrderDialogResult>>(MatDialogRef);

  readonly max = CANCEL_REASON_MAX;
  readonly reason = signal('');
  readonly length = computed(() => this.reason().trim().length);

  save(): void {
    this.#ref.close({ reason: this.reason().trim().slice(0, CANCEL_REASON_MAX) });
  }
}
