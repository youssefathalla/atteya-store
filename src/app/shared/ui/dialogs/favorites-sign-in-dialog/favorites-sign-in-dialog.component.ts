import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export type FavoritesSignInDialogResult = 'sign-in' | 'create' | null;

@Component({
  selector: 'app-favorites-sign-in-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title class="font-title-lg font-bold!">Save to favorites</h2>
    <mat-dialog-content>
      <p class="font-body-md opacity-85 py-1">
        Sign in or create an account to save favorites.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="gap-2 px-6 pb-4 flex-wrap">
      <button matButton="text" type="button" (click)="close(null)">Cancel</button>
      <button matButton="outlined" type="button" (click)="close('create')">Create account</button>
      <button matButton="filled" type="button" (click)="close('sign-in')">Sign in</button>
    </mat-dialog-actions>
  `,
})
export class FavoritesSignInDialogComponent {
  readonly #dialogRef =
    inject(MatDialogRef<FavoritesSignInDialogComponent, FavoritesSignInDialogResult>);

  close(result: FavoritesSignInDialogResult): void {
    this.#dialogRef.close(result);
  }
}
