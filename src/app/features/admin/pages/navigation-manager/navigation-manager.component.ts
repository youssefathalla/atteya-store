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
  readonly isLive = this.#navService.isLive;
  readonly isLoading = this.#navService.isLoading;
  readonly isSaving = signal<boolean>(false);
  readonly isSeeding = signal<boolean>(false);

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

  async publishToFirestore(): Promise<void> {
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
      this.#snackbar.success('Published! Navigation updated in Firestore.');
    } catch (err) {
      console.error('Failed to publish navigation to Firestore:', err);
      this.#snackbar.error('Failed to save to Firestore. Check permissions.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async seedFromDefaults(): Promise<void> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Seed Navigation Database',
          message:
            'Are you sure you want to seed the database? This will populate settings/navigation in Firestore with the default store catalog.',
          confirmText: 'Seed Database',
          cancelText: 'Cancel',
          theme: 'primary',
        },
        width: '500px',
        maxWidth: '90vw',
      },
    );

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    if (!confirmed) return;

    this.isSeeding.set(true);
    try {
      await this.#navService.seedDefaultNavigation();
      this.draft.markSaved();
      this.#snackbar.success('Firestore settings/navigation seeded successfully!');
      this.draft.resetDraftFromSource(NAV_CATEGORIES);
    } catch (err) {
      console.error('Failed to seed navigation:', err);
      this.#snackbar.error('Failed to seed navigation.');
    } finally {
      this.isSeeding.set(false);
    }
  }

  discardDraft(): void {
    this.draft.discardDraft(this.#navService.categories());
  }
}
