import { Component, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AuthService } from '@core/services/auth/auth.service';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { StorageUploadService } from '@core/services/storage';
import { NavService } from '@core/services/navigation';
import { firebaseErrors } from '@shared/utils/firebase/firebase-errors';
import { HomeService, homeSettingsFromVersion } from '@features/home/services/home.service';
import { restoredVersionNote, type SettingsVersion } from '@core/services/settings-history';
import {
  DEFAULT_HOME_HERO,
  DEFAULT_HOME_NAV_LIST,
  DEFAULT_HOME_SHOP_CATEGORIES,
} from '@features/home/data/home.data';
import { HomeManagerHeaderComponent } from './components/home-manager-header/home-manager-header.component';
import { HomeHeroEditorComponent } from './components/home-hero-editor/home-hero-editor.component';
import { HomeHeroPreviewComponent } from './components/home-hero-preview/home-hero-preview.component';
import { HomeCategoriesPreviewComponent } from './components/home-categories-preview/home-categories-preview.component';
import { HomeCategoriesEditorComponent } from './components/home-categories-editor/home-categories-editor.component';
import { HomeNavListPreviewComponent } from './components/home-nav-list-preview/home-nav-list-preview.component';
import { HomeNavListEditorComponent } from './components/home-nav-list-editor/home-nav-list-editor.component';
import { HomeDraftService } from './services/home-draft.service';
import { HomeDialogService } from './services/home-dialog.service';
import { NavigationCatalogService } from '../navigation-manager/services/navigation-catalog.service';
import { homeHiddenLinks, homeLinkProblem, homeWithTargets } from './utils/home-link-targets.utils';
import { hiddenTargetsMessage } from '../navigation-manager/utils/navigation-manager.validator';
import {
  type HomeLinkCheck,
  validateHomeHeroDraft,
  validateHomeNavListDraft,
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
    HomeNavListPreviewComponent,
    HomeNavListEditorComponent,
  ],
})
export class HomeManagerComponent {
  readonly #homeService = inject(HomeService);
  readonly #navService = inject(NavService);
  readonly #linkCatalog = inject(NavigationCatalogService);
  readonly #snackbar = inject(SnackbarService);
  readonly #dialogs = inject(HomeDialogService);
  readonly #storageUpload = inject(StorageUploadService);
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);

  readonly #isSaving = signal<boolean>(false);
  readonly #isResetting = signal<boolean>(false);

  readonly draft = inject(HomeDraftService);
  readonly isLoading = this.#homeService.isLoading;
  readonly isSaving = this.#isSaving.asReadonly();
  readonly isResetting = this.#isResetting.asReadonly();
  /** "Restored the version from …" while a restored version is still a draft. */
  readonly restoredNote = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.#homeService.isLoading()) return;

      const liveHero = this.#homeService.hero();
      const liveShop = this.#homeService.shopCategories();
      const liveNav = this.#homeService.navList();
      if (!this.draft.isDirty()) {
        untracked(() => {
          this.draft.resetDraftFromSource(liveHero, liveShop, liveNav);
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

  async confirmRemoveNavItem(index: number): Promise<void> {
    const item = this.draft.navItems()[index];
    if (!item) return;
    const confirmed = await this.#dialogs.confirmRemoveNavItem(item.label);
    if (confirmed) this.draft.removeNavItem(index);
  }

  async importNavFromMenu(): Promise<void> {
    if (this.draft.navItems().length > 0) {
      const confirmed = await this.#dialogs.confirmImportNavFromMenu();
      if (!confirmed) return;
    }
    const imported = this.draft.importNavItems(this.#navService.expandedCategories());
    if (imported === 0) {
      this.#snackbar.info('No menu links are ready to import yet.');
    }
  }

  async publishChanges(): Promise<void> {
    // Every link saved with its target and the address built from it (ATS-267).
    const { hero, shopCategories, navList } = homeWithTargets(
      {
        hero: this.draft.draftHero(),
        shopCategories: this.draft.draftShopCategories(),
        navList: this.draft.draftNavList(),
      },
      this.#linkCatalog.bestCatalog(),
    );
    const fullCatalog = this.#linkCatalog.targetCatalog();
    const checkLink: HomeLinkCheck = (target, link, allowOutside) =>
      homeLinkProblem(target, link, fullCatalog, allowOutside);

    const heroError = validateHomeHeroDraft(hero, checkLink);
    if (heroError) {
      this.draft.setActiveSection('hero');
      this.#snackbar.error(heroError);
      return;
    }

    const shopError = validateHomeShopCategoriesDraft(shopCategories, checkLink);
    if (shopError) {
      this.draft.setActiveSection('categories');
      this.#snackbar.error(shopError);
      return;
    }

    const navError = validateHomeNavListDraft(navList, checkLink);
    if (navError) {
      this.draft.setActiveSection('navList');
      this.#snackbar.error(navError);
      return;
    }

    this.#isSaving.set(true);
    try {
      const orphanedPaths = this.draft.getOrphanedPathsForPublish();

      await this.#homeService.updateHomeSettings(
        { hero, shopCategories, navList },
        this.#auth.user()?.uid ?? '',
      );
      await this.#storageUpload.deleteImages(orphanedPaths);

      this.draft.markSaved();
      this.restoredNote.set(null);
      const hidden = homeHiddenLinks({ hero, shopCategories, navList }, fullCatalog);
      if (hidden.length > 0) this.#snackbar.warning(hiddenTargetsMessage(hidden), 'Close', 8000);
      else this.#snackbar.success('Published! Your homepage sections are now live.');
    } catch (err) {
      await this.#reportWriteError(err, 'Unable to publish changes. Please try again.');
    } finally {
      this.#isSaving.set(false);
    }
  }

  /** Previous Versions (ATS-251): a saved version opens as a draft; the built-in one publishes as before. */
  async openPreviousVersions(): Promise<void> {
    const choice = await this.#dialogs.openPreviousVersions({
      docId: 'home',
      builtInHint:
        'The hero, shop cards and category list the store started with. It goes live straight away.',
      canRestore: (data) => homeSettingsFromVersion(data) !== null,
    });
    if (!choice) return;
    if (choice.kind === 'built-in') {
      await this.resetToDefaults();
      return;
    }
    // Restoring replaces the draft: ask first when there are unpublished edits.
    if (this.draft.isDirty() && !(await this.#dialogs.confirmRestoreOverDraft())) return;
    this.#restoreVersion(choice.version);
  }

  #restoreVersion(version: SettingsVersion): void {
    const settings = homeSettingsFromVersion(version.data);
    if (!settings) {
      this.#snackbar.error("Can't restore this version.");
      return;
    }
    this.draft.loadVersion(settings.hero, settings.shopCategories, settings.navList);
    this.restoredNote.set(restoredVersionNote(version.savedAtMs));
  }

  async resetToDefaults(): Promise<void> {
    const confirmed = await this.#dialogs.confirmResetDefaults();
    if (!confirmed) return;

    this.#isResetting.set(true);
    try {
      const orphanedPaths = this.draft.getOrphanedPathsForReset();

      await this.#homeService.resetDefaultHomeSettings(this.#auth.user()?.uid ?? '');
      await this.#storageUpload.deleteImages(orphanedPaths);

      this.draft.resetDraftFromSource(DEFAULT_HOME_HERO, DEFAULT_HOME_SHOP_CATEGORIES, DEFAULT_HOME_NAV_LIST);
      this.restoredNote.set(null);
      this.#snackbar.success('Default homepage sections restored.');
    } catch (err) {
      await this.#reportWriteError(err, 'Unable to restore default sections. Please try again.');
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
    const liveNav = this.#homeService.navList();
    const orphanedPaths = this.draft.getOrphanedPathsForDiscard(liveHero, liveShop, liveNav);
    await this.#storageUpload.deleteImages(orphanedPaths);
    this.draft.discardDraft(liveHero, liveShop, liveNav);
    this.restoredNote.set(null);
  }

  async #reportWriteError(err: unknown, fallback: string): Promise<void> {
    console.error(fallback, err);
    this.#snackbar.error(isPermissionDenied(err) ? firebaseErrors(err) : fallback);
    if (isPermissionDenied(err)) {
      await this.#auth.redirectIfNoLongerAdmin(this.#router.url);
    }
  }
}
