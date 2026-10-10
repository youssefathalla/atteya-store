import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  theme?: 'error' | 'primary' | 'warning' | 'info' | 'success';
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="font-body-md opacity-85 py-1">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="gap-2 px-6 pb-4">
      <button matButton="text" type="button" [mat-dialog-close]="false">{{ data.cancelText || 'Cancel' }}</button>
      <button matButton="filled" [attr.theme]="data.theme || 'error'" type="button" [mat-dialog-close]="true">
        {{ data.confirmText || 'Delete' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
