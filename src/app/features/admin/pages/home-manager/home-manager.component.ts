import { Component, effect, inject, signal, untracked } from '@angular/core';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { StorageUploadService } from '@core/services/storage';
import { HomeService } from '@features/home/services/home.service';
import { DEFAULT_HOME_HERO } from '@features/home/data/home.data';
import { HomeManagerHeaderComponent } from './components/home-manager-header/home-manager-header.component';
import { HomeHeroEditorComponent } from './components/home-hero-editor/home-hero-editor.component';
import { HomeHeroPreviewComponent } from './components/home-hero-preview/home-hero-preview.component';
import { HomeDraftService } from './services/home-draft.service';
import { HomeDialogService } from './services/home-dialog.service';
import { validateHomeHeroDraft } from './utils/home-manager.validator';
import { HeroAction } from './models/home-manager.model';

@Component({
  selector: 'app-home-manager',
  templateUrl: './home-manager.component.html',
  imports: [
    HomeManagerHeaderComponent,
    HomeHeroEditorComponent,
    HomeHeroPreviewComponent,
  ],
})
export class HomeManagerComponent {
  readonly #homeService = inject(HomeService);
  readonly #snackbar = inject(SnackbarService);
  readonly #dialogs = inject(HomeDialogService);
  readonly #storageUpload = inject(StorageUploadService);

  readonly draft = inject(HomeDraftService);
  readonly isSaving = signal<boolean>(false);
  readonly isResetting = signal<boolean>(false);

  constructor() {
    effect(() => {
      if (this.#homeService.isLoading()) return;

      const liveHero = this.#homeService.hero();
      if (!this.draft.isDirty()) {
        untracked(() => {
          this.draft.resetDraftFromSource(liveHero);
        });
      }
    });
  }

  async openAddActionDialog(): Promise<void> {
    const result = await this.#dialogs.openAddAction();
    if (result) this.draft.addAction(result);
  }

  async openEditActionDialog(index: number, action: HeroAction): Promise<void> {
    const result = await this.#dialogs.openAddAction(action);
    if (result) this.draft.updateAction(index, result);
  }

  async confirmDeleteAction(index: number): Promise<void> {
    const action = this.draft.draftHero().actions[index];
    if (!action) return;
    const confirmed = await this.#dialogs.confirmDeleteAction(action.label);
    if (confirmed) this.draft.removeAction(index);
  }

  async publishChanges(): Promise<void> {
    const hero = this.draft.draftHero();
    const error = validateHomeHeroDraft(hero);
    if (error) {
      this.#snackbar.error(error);
      return;
    }

    this.isSaving.set(true);
    try {
      const oldHero = this.#homeService.hero();
      await this.#homeService.updateHero(hero);

      // Clean up previous image file from Firebase Storage if replaced
      if (oldHero.imageUrl && oldHero.imageUrl !== hero.imageUrl) {
        await this.#storageUpload.deleteImage(oldHero.imageUrl);
      }

      this.draft.markSaved();
      this.#snackbar.success('Published! Home page hero banner updated successfully.');
    } catch (err) {
      console.error('Failed to update home page hero:', err);
      this.#snackbar.error('Failed to save changes. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async resetToDefaults(): Promise<void> {
    const confirmed = await this.#dialogs.confirmResetDefaults();
    if (!confirmed) return;

    this.isResetting.set(true);
    try {
      const oldHero = this.#homeService.hero();
      await this.#homeService.resetDefaultHero();

      // Clean up previous uploaded image if not the default asset
      if (oldHero.imageUrl && oldHero.imageUrl !== DEFAULT_HOME_HERO.imageUrl) {
        await this.#storageUpload.deleteImage(oldHero.imageUrl);
      }

      this.draft.resetDraftFromSource(DEFAULT_HOME_HERO);
      this.#snackbar.success('Default hero banner restored successfully!');
    } catch (err) {
      console.error('Failed to reset hero banner:', err);
      this.#snackbar.error('Failed to reset hero banner.');
    } finally {
      this.isResetting.set(false);
    }
  }

  async discardDraft(): Promise<void> {
    if (this.draft.isDirty()) {
      const confirmed = await this.#dialogs.confirmDiscardDraft();
      if (!confirmed) return;
    }
    this.draft.discardDraft(this.#homeService.hero());
  }
}
