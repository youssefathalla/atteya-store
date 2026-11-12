import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth/auth.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';

const DELETE_FAILED = "We couldn't delete your account. Please try again in a moment.";

/**
 * Account → Delete Account: asks first, then deletes the account for good through
 * `AuthService.deleteAccount()` and returns home. Past orders stay in our records.
 */
@Component({
  selector: 'app-delete-account-section',
  host: { class: 'block w-full account-section' },
  imports: [MatButtonModule, MatProgressSpinnerModule, SharedIconModule],
  templateUrl: './delete-account-section.component.html',
})
export class DeleteAccountSectionComponent {
  readonly #auth = inject(AuthService);
  readonly #dialog = inject(MatDialog);
  readonly #snackbar = inject(SnackbarService);

  readonly isDeleting = signal(false);

  async deleteAccount(): Promise<void> {
    const ref = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        width: '440px',
        data: {
          title: 'Delete Your Account?',
          message:
            'This deletes your details, saved bag and favorites for good, and you can’t undo it. Your past orders stay in our records so we can still help with them.',
          confirmText: 'Delete Account',
          cancelText: 'Keep My Account',
          theme: 'error',
        },
      },
    );
    if ((await firstValueFrom(ref.afterClosed())) !== true) return;

    this.isDeleting.set(true);
    try {
      await this.#auth.deleteAccount();
    } catch (error) {
      this.#snackbar.error(callableMessage(error) ?? DELETE_FAILED);
    } finally {
      this.isDeleting.set(false);
    }
  }
}
