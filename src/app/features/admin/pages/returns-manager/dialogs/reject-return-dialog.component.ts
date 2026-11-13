import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { REJECT_REASON_MAX } from '@core/config/returns';

export interface RejectReturnDialogData {
  readonly ref: string;
  /** Approved already: Reject moves stock as `stockLines` say. */
  readonly approved: boolean;
  /** What Reject does to stock, one line per item (`rejectStockLines`). */
  readonly stockLines: readonly string[];
}

/** Closes with the reason, trimmed; Keep Request closes with nothing. */
export interface RejectReturnDialogResult {
  readonly reason: string;
}

/** Reject asks for a reason the customer sees (ATS-293). */
@Component({
  selector: 'app-reject-return-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">Reject Request {{ data.ref }}?</h2>
    <form (submit)="$event.preventDefault(); save()">
      <mat-dialog-content>
        <div class="return-dialog-fields">
          @if (!data.approved) {
            <p class="font-body-md opacity-85">Nothing was taken out of stock yet.</p>
          } @else if (data.stockLines.length === 0) {
            <p class="font-body-md opacity-85">Stock stays as it is.</p>
          } @else {
            @for (line of data.stockLines; track $index) {
              <p class="font-body-md opacity-85">{{ line }}</p>
            }
          }
          <mat-form-field class="w-full" appearance="outline">
            <mat-label>Reason</mat-label>
            <textarea
              matInput
              rows="3"
              required
              [attr.maxlength]="max"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
            ></textarea>
            <mat-hint>The customer sees this. {{ length() }} / {{ max }}</mat-hint>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions class="catalog-dialog-actions">
        <button matButton="text" type="button" [mat-dialog-close]="undefined">Keep Request</button>
        <button matButton="filled" theme="error" type="submit" [disabled]="length() === 0">
          Reject Request
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class RejectReturnDialogComponent {
  readonly data = inject<RejectReturnDialogData>(MAT_DIALOG_DATA);
  readonly #ref = inject<MatDialogRef<RejectReturnDialogComponent, RejectReturnDialogResult>>(MatDialogRef);

  readonly max = REJECT_REASON_MAX;
  readonly reason = signal('');
  readonly length = computed(() => this.reason().trim().length);

  save(): void {
    const reason = this.reason().trim().slice(0, REJECT_REASON_MAX);
    if (reason) this.#ref.close({ reason });
  }
}
