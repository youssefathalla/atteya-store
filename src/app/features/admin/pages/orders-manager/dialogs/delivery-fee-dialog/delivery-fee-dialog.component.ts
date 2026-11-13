import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface DeliveryFeeDialogData {
  /** `#A1B2C3`. */
  readonly orderRef: string;
  /** Fee already saved (Change), or null the first time (Set). */
  readonly currentFeeEgp: number | null;
}

const MAX_FEE_EGP = 100_000;

/** Asks for the delivery fee agreed with the shopper on WhatsApp. Closes with the fee, or nothing. */
@Component({
  selector: 'app-delivery-fee-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">
      {{ data.currentFeeEgp === null ? 'Set' : 'Change' }} Delivery Fee for {{ data.orderRef }}
    </h2>
    <form (submit)="$event.preventDefault(); save()">
      <mat-dialog-content>
        <div class="elements-start-col gap-3">
          <p class="font-body-md opacity-85">
            Enter the fee you agreed with the customer on WhatsApp. Their order page and the amount to pay
            update right away, and we email them the fee.
          </p>
          <mat-form-field class="w-full" subscriptSizing="dynamic" appearance="outline">
            <mat-label>Delivery fee (EGP)</mat-label>
            <input
              matInput
              type="text"
              inputmode="numeric"
              autocomplete="off"
              [value]="fee()"
              (input)="fee.set($any($event.target).value)"
              [attr.aria-invalid]="error() ? 'true' : null"
            />
            <!-- Plain input (no form control), so mat-error would never show: the hint carries it. -->
            <mat-hint [attr.role]="error() ? 'alert' : null">
              {{ error() || 'Whole pounds. Use 0 for free delivery.' }}
            </mat-hint>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end" class="gap-2 px-6 pb-4">
        <button matButton="text" type="button" [mat-dialog-close]="undefined">Cancel</button>
        <button matButton="filled" type="submit" [disabled]="parsed() === null">Save Fee</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class DeliveryFeeDialogComponent {
  readonly data = inject<DeliveryFeeDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<DeliveryFeeDialogComponent, number>>(MatDialogRef);

  readonly fee = signal(this.data.currentFeeEgp === null ? '' : String(this.data.currentFeeEgp));

  readonly parsed = computed((): number | null => {
    const text = this.fee().trim().replace(/,/g, '');
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    return Number.isSafeInteger(value) && value <= MAX_FEE_EGP ? value : null;
  });

  readonly error = computed(() =>
    this.fee().trim() !== '' && this.parsed() === null ? 'Enter whole pounds from 0 to 100,000.' : '',
  );

  save(): void {
    const value = this.parsed();
    if (value !== null) this.#ref.close(value);
  }
}
