import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  openPreviousVersionsDialog,
  type PreviousVersionsDialogData,
  type PreviousVersionsDialogResult,
} from '@shared/ui/dialogs/previous-versions-dialog';
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

  async confirmRemoveNavItem(label: string): Promise<boolean> {
    const name = label.trim() || 'this link';
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Remove category link',
          message: `Remove "${name}" from the category list?`,
          confirmText: 'Remove',
          cancelText: 'Keep',
          theme: 'error',
        },
        width: '440px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }

  async confirmImportNavFromMenu(): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Use menu links',
          message: 'Replace this list with the links from your menu? Photos on these links will be cleared.',
          confirmText: 'Replace Links',
          cancelText: 'Keep Editing',
          theme: 'warning',
        },
        width: '480px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }

  openPreviousVersions(data: PreviousVersionsDialogData): Promise<PreviousVersionsDialogResult | null> {
    return openPreviousVersionsDialog(this.#dialog, data);
  }

  async confirmResetDefaults(): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Restore the Built-in Home Page?',
          message:
            'The hero, shop cards and category list go back to the ones the store started with, live on the store straight away. Unpublished changes are lost; the home page you have now stays in Previous Versions.',
          confirmText: 'Restore and Publish',
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
