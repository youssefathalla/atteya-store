import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import {
  AddCategoryDialogComponent,
  AddCategoryDialogResult,
} from '../dialogs/add-category-dialog/add-category-dialog.component';
import {
  AddColumnDialogComponent,
  AddColumnDialogData,
  AddColumnDialogResult,
} from '../dialogs/add-column-dialog/add-column-dialog.component';
import {
  AddLinkDialogComponent,
  AddLinkDialogData,
  AddLinkDialogResult,
} from '../dialogs/add-link-dialog/add-link-dialog.component';

@Service()
export class NavigationDialogService {
  readonly #dialog = inject(MatDialog);

  async openAddCategory(): Promise<AddCategoryDialogResult | null> {
    const dialogRef = this.#dialog.open<AddCategoryDialogComponent, void, AddCategoryDialogResult | null>(
      AddCategoryDialogComponent,
      {
        width: '480px',
        maxWidth: '92vw',
      },
    );

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result ?? null;
  }

  async confirmDeleteCategory(label: string): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Category',
          message: `Are you sure you want to delete "${label}"? All columns and links in this category will be removed.`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          theme: 'error',
        },
        width: '450px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }

  async openAddColumn(categoryLabel?: string): Promise<AddColumnDialogResult | null> {
    const dialogRef = this.#dialog.open<
      AddColumnDialogComponent,
      AddColumnDialogData,
      AddColumnDialogResult | null
    >(AddColumnDialogComponent, {
      data: {
        categoryLabel: categoryLabel || undefined,
      },
      width: '460px',
      maxWidth: '92vw',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result ?? null;
  }

  async confirmDeleteColumn(title: string, linkCount: number): Promise<boolean> {
    const linkWord = linkCount === 1 ? 'link' : 'links';
    const message =
      linkCount > 0
        ? `Are you sure you want to delete "${title}"? All ${linkCount} ${linkWord} inside it will be removed.`
        : `Are you sure you want to delete "${title}"?`;

    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Column',
          message,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          theme: 'error',
        },
        width: '450px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }

  async openAddLink(columnTitle?: string, categoryPath?: string): Promise<AddLinkDialogResult | null> {
    const dialogRef = this.#dialog.open<
      AddLinkDialogComponent,
      AddLinkDialogData,
      AddLinkDialogResult | null
    >(AddLinkDialogComponent, {
      data: {
        columnTitle,
        categoryPath,
      },
      width: '480px',
      maxWidth: '92vw',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result ?? null;
  }

  async confirmDeleteLink(label: string): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Delete Link',
          message: `Are you sure you want to delete "${label}"?`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          theme: 'error',
        },
        width: '450px',
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
            'Are you sure you want to reset the navigation? This will restore the default store catalog.',
          confirmText: 'Reset to Defaults',
          cancelText: 'Cancel',
          theme: 'primary',
        },
        width: '500px',
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
          message: 'Are you sure you want to discard your unsaved changes? All modifications will be lost.',
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
