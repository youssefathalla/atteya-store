import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import type { TeamRole } from '../models/admin-role.model';

@Service()
export class AdminRoleDialogService {
  readonly #dialog = inject(MatDialog);

  confirmRemove(email: string): Promise<boolean> {
    return this.#confirm({
      title: 'Remove Dashboard Access?',
      message: `${email} will no longer be able to manage the store. If they're signed in now, they'll be signed out.`,
      confirmText: 'Remove Access',
      cancelText: 'Cancel',
      theme: 'error',
    });
  }

  /** Changing someone between Admin and Staff. Going down to Staff signs them out once. */
  confirmChange(email: string, to: TeamRole): Promise<boolean> {
    return this.#confirm(
      to === 'admin'
        ? {
            title: 'Make Admin?',
            message: `${email} will also be able to delete orders and choose who can manage the store.`,
            confirmText: 'Make Admin',
            cancelText: 'Cancel',
            theme: 'primary',
          }
        : {
            title: 'Make Staff?',
            message: `${email} will keep the dashboard but can no longer delete orders or open this page. They'll need to sign in again.`,
            confirmText: 'Make Staff',
            cancelText: 'Cancel',
            theme: 'primary',
          },
    );
  }

  async #confirm(data: ConfirmDialogData): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      { data, width: '440px', maxWidth: '90vw' },
    );
    return !!(await firstValueFrom(dialogRef.afterClosed()));
  }
}
