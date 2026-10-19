import { Component, effect, inject, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { StorageUploadService } from '@core/services/storage';
import { HomeService } from '@features/home/services/home.service';
import {
  DEFAULT_HOME_HERO,
  DEFAULT_HOME_SHOP_CATEGORIES,
} from '@features/home/data/home.data';
import { HomeManagerHeaderComponent } from './components/home-manager-header/home-manager-header.component';
import { HomeHeroEditorComponent } from './components/home-hero-editor/home-hero-editor.component';
import { HomeHeroPreviewComponent } from './components/home-hero-preview/home-hero-preview.component';
import { HomeCategoriesPreviewComponent } from './components/home-categories-preview/home-categories-preview.component';
import { HomeCategoriesEditorComponent } from './components/home-categories-editor/home-categories-editor.component';
import { HomeDraftService } from './services/home-draft.service';
import { HomeDialogService } from './services/home-dialog.service';
import {
  validateHomeHeroDraft,
  validateHomeShopCategoriesDraft,
} from './utils/home-manager.validator';
import { HeroAction } from './models/home-manager.model';

@Component({
  selector: 'app-home-manager',
  templateUrl: './home-manager.component.html',
  imports: [
    MatButtonModule,
    SharedIconModule,
    HomeManagerHeaderComponent,
    HomeHeroEditorComponent,
    HomeHeroPreviewComponent,
    HomeCategoriesPreviewComponent,
    HomeCategoriesEditorComponent,
  ],
})
export class HomeManagerComponent {
  readonly #homeService = inject(HomeService);
  readonly #snackbar = inject(SnackbarService);
  readonly #dialogs = inject(HomeDialogService);
  readonly #storageUpload = inject(StorageUploadService);

  readonly #isSaving = signal<boolean>(false);
  readonly #isResetting = signal<boolean>(false);

  readonly draft = inject(HomeDraftService);
  readonly isLoading = this.#homeService.isLoading;
  readonly isSaving = this.#isSaving.asReadonly();
  readonly isResetting = this.#isResetting.asReadonly();

  constructor() {
    effect(() => {
      if (this.#homeService.isLoading()) return;

      const liveHero = this.#homeService.hero();
      const liveShop = this.#homeService.shopCategories();
      if (!this.draft.isDirty()) {
        untracked(() => {
          this.draft.resetDraftFromSource(liveHero, liveShop);
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
    const action = this.draft.activeSlide().actions[index];
    if (!action) return;
    const confirmed = await this.#dialogs.confirmDeleteAction(action.label);
    if (confirmed) this.draft.removeAction(index);
  }

  async publishChanges(): Promise<void> {
    const hero = this.draft.draftHero();
    const shopCategories = this.draft.draftShopCategories();

    const heroError = validateHomeHeroDraft(hero);
    if (heroError) {
      this.draft.setActiveSection('hero');
      this.#snackbar.error(heroError);
      return;
    }

    const shopError = validateHomeShopCategoriesDraft(shopCategories);
    if (shopError) {
      this.draft.setActiveSection('categories');
      this.#snackbar.error(shopError);
      return;
    }

    this.#isSaving.set(true);
    try {
      const oldHero = this.#homeService.hero();
      const oldShop = this.#homeService.shopCategories();
      const orphanedPaths = this.draft.getOrphanedPathsForPublish(oldHero, oldShop);

      await this.#homeService.updateHomeSettings(hero, shopCategories);
      await this.#storageUpload.deleteImages(orphanedPaths);

      this.draft.markSaved();
      this.#snackbar.success('Published! Your homepage sections are now live.');
    } catch (err) {
      console.error('Failed to update home page settings:', err);
      this.#snackbar.error('Unable to publish changes. Please try again.');
    } finally {
      this.#isSaving.set(false);
    }
  }

  async resetToDefaults(): Promise<void> {
    const confirmed = await this.#dialogs.confirmResetDefaults();
    if (!confirmed) return;

    this.#isResetting.set(true);
    try {
      const oldHero = this.#homeService.hero();
      const oldShop = this.#homeService.shopCategories();
      const orphanedPaths = this.draft.getOrphanedPathsForReset(oldHero, oldShop);

      await this.#homeService.resetDefaultHomeSettings();
      await this.#storageUpload.deleteImages(orphanedPaths);

      this.draft.resetDraftFromSource(DEFAULT_HOME_HERO, DEFAULT_HOME_SHOP_CATEGORIES);
      this.#snackbar.success('Default homepage sections restored.');
    } catch (err) {
      console.error('Failed to reset home sections:', err);
      this.#snackbar.error('Unable to restore default sections. Please try again.');
    } finally {
      this.#isResetting.set(false);
    }
  }

  async discardDraft(): Promise<void> {
    if (this.draft.isDirty()) {
      const confirmed = await this.#dialogs.confirmDiscardDraft();
      if (!confirmed) return;
    }
    const liveHero = this.#homeService.hero();
    const liveShop = this.#homeService.shopCategories();
    const orphanedPaths = this.draft.getOrphanedPathsForDiscard(liveHero, liveShop);
    await this.#storageUpload.deleteImages(orphanedPaths);
    this.draft.discardDraft(liveHero, liveShop);
  }
}
