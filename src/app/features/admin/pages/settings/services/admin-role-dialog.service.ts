import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';

@Service()
export class AdminRoleDialogService {
  readonly #dialog = inject(MatDialog);

  async confirmRemove(email: string): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Remove admin access',
          message: `Remove admin access for ${email}? They will no longer be able to manage the store.`,
          confirmText: 'Remove Admin',
          cancelText: 'Cancel',
          theme: 'error',
        },
        width: '440px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }
}
