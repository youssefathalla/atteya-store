import { Component, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { NavService } from '@layout/navbar/nav.service';
import { NAV_CATEGORIES } from '@layout/navbar/nav.data';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { NavManagerHeaderComponent } from './components/nav-manager-header/nav-manager-header.component';
import { NavCategoryListComponent } from './components/nav-category-list/nav-category-list.component';
import { NavCategoryDetailsComponent } from './components/nav-category-details/nav-category-details.component';
import { NavMegaMenuEditorComponent } from './components/nav-mega-menu-editor/nav-mega-menu-editor.component';
import { NavigationDraftService } from './navigation-draft.service';
import { validateNavigationDraft } from './navigation-manager.validator';

@Component({
  selector: 'app-navigation-manager',
  templateUrl: './navigation-manager.component.html',
  imports: [
    NavManagerHeaderComponent,
    NavCategoryListComponent,
    NavCategoryDetailsComponent,
    NavMegaMenuEditorComponent,
  ],
})
export class NavigationManagerComponent {
  readonly #navService = inject(NavService);
  readonly #snackbar = inject(SnackbarService);
  readonly #dialog = inject(MatDialog);
  readonly draft = inject(NavigationDraftService);
  readonly isSaving = signal<boolean>(false);
  readonly isResetting = signal<boolean>(false);

  constructor() {
    effect(() => {
      if (this.#navService.isLoading()) return;

      const liveCategories = this.#navService.categories();
      if (!this.draft.isDraftDirty() && liveCategories.length > 0) {
        untracked(() => {
          this.draft.resetDraftFromSource(liveCategories);
        });
      }
    });
  }

  async publishChanges(): Promise<void> {
    const categories = this.draft.draftCategories();

    const validationError = validateNavigationDraft(categories);
    if (validationError) {
      this.#snackbar.error(validationError);
      return;
    }

    this.isSaving.set(true);
    try {
      await this.#navService.updateNavigation(categories);
      this.draft.markSaved();
      this.#snackbar.success('Published! Navigation updated successfully.');
    } catch (err) {
      console.error('Failed to publish navigation:', err);
      this.#snackbar.error('Failed to save changes. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async resetToDefaults(): Promise<void> {
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
    if (!confirmed) return;

    this.isResetting.set(true);
    try {
      await this.#navService.resetDefaultNavigation();
      this.draft.markSaved();
      this.#snackbar.success('Default navigation restored successfully!');
      this.draft.resetDraftFromSource(NAV_CATEGORIES);
    } catch (err) {
      console.error('Failed to reset navigation:', err);
      this.#snackbar.error('Failed to reset navigation.');
    } finally {
      this.isResetting.set(false);
    }
  }

  discardDraft(): void {
    this.draft.discardDraft(this.#navService.categories());
  }
}
