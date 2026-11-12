import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DeleteBlockedDialogData {
  /** "Apparel can’t be deleted". */
  readonly title: string;
  /** The server's reason, e.g. "Apparel still has 58 live and 3 hidden products. …". */
  readonly message: string;
  /** Offer See These Products (a category with products). */
  readonly canSeeProducts: boolean;
  /** Offer Hide Instead (it is shown on the store now). */
  readonly canHide: boolean;
}

/** What the window closes with; undefined = Keep It (nothing happens). */
export type DeleteBlockedDialogResult = 'hide' | 'products' | undefined;

/**
 * Says why a category or brand can't be deleted (ATS-265) and offers what to do instead:
 * See These Products (opens Products filtered to it) and Hide Instead.
 */
@Component({
  selector: 'app-delete-blocked-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="font-body-md py-1">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="gap-2 px-6 pb-4 flex-wrap">
      <button matButton="text" type="button" [mat-dialog-close]="undefined">Keep It</button>
      @if (data.canSeeProducts) {
        <button matButton="outlined" type="button" [mat-dialog-close]="'products'">See These Products</button>
      }
      @if (data.canHide) {
        <button matButton="filled" theme="warning" type="button" [mat-dialog-close]="'hide'">
          Hide Instead
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class DeleteBlockedDialogComponent {
  readonly data = inject<DeleteBlockedDialogData>(MAT_DIALOG_DATA);
}
