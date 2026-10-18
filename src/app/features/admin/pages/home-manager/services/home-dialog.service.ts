import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import {
  AddActionDialogComponent,
  AddActionDialogData,
  AddActionDialogResult,
} from '../dialogs/add-action-dialog/add-action-dialog.component';
import { HeroAction } from '../models/home-manager.model';

@Service()
export class HomeDialogService {
  readonly #dialog = inject(MatDialog);

  async openAddAction(action?: HeroAction): Promise<AddActionDialogResult | null> {
    const dialogRef = this.#dialog.open<
      AddActionDialogComponent,
      AddActionDialogData,
      AddActionDialogResult | null
    >(AddActionDialogComponent, {
      data: { action },
      width: '460px',
      maxWidth: '92vw',
      maxHeight: '80vh',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result ?? null;
  }

  async confirmDeleteAction(label: string): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Button',
          message: `Are you sure you want to remove the "${label}" button from the hero banner?`,
          confirmText: 'Remove',
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

  async confirmResetDefaults(): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Reset to Defaults',
          message:
            'Are you sure you want to reset the home hero banner to its default branding? Any unpublished changes will be overwritten.',
          confirmText: 'Reset to Defaults',
          cancelText: 'Cancel',
          theme: 'primary',
        },
        width: '480px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }

  async confirmDiscardDraft(): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Discard Draft Changes',
          message:
            'Are you sure you want to discard your unsaved changes? All modifications will revert to the live version.',
          confirmText: 'Discard Changes',
          cancelText: 'Keep Editing',
          theme: 'warning',
        },
        width: '450px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }
}
