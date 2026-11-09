import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import {
  ImgPreviewDialogComponent,
  ImgPreviewData,
} from '@shared/ui/img-preview-dialog/img-preview-dialog.component';

@Component({
  selector: 'app-dialogs-tab',
  imports: [MatButtonModule, SharedIconModule],
  templateUrl: './dialogs-tab.component.html',
})
export class DialogsTabComponent {
  readonly #dialog = inject(MatDialog);
  readonly #snackbarService = inject(SnackbarService);

  protected openConfirmModal(): void {
    this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData>(ConfirmDialogComponent, {
      data: {
        title: 'Confirm Component Deployment',
        message: 'Are you sure you want to deploy these design tokens to the production design system?',
        confirmText: 'Deploy to Production',
        cancelText: 'Cancel',
      },
      width: '500px',
      maxWidth: '90vw',
    });
  }

  protected openImagePreviewModal(): void {
    this.#dialog.open<ImgPreviewDialogComponent, ImgPreviewData>(ImgPreviewDialogComponent, {
      data: {
        title: 'System Architecture & Token Map',
        imageSrc: 'images/architecture_preview.jpg',
      },
      width: '90vw',
      maxWidth: '1200px',
      height: '80vh',
      panelClass: 'mat-dialog-no-padding',
    });
  }

  protected triggerSnackbar(type: 'success' | 'warning' | 'info' | 'error'): void {
    switch (type) {
      case 'success':
        this.#snackbarService.success('Record successfully created and validated!', 'View');
        break;
      case 'warning':
        this.#snackbarService.warning('Warning: Form contains uncommitted changes.', 'Review');
        break;
      case 'info':
        this.#snackbarService.info('System maintenance scheduled for 02:00 UTC.', 'Details');
        break;
      case 'error':
        this.#snackbarService.error('Failed to synchronize design tokens with server.', 'Retry');
        break;
    }
  }
}
