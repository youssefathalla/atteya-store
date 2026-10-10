import { Component, effect, inject, signal, untracked } from '@angular/core';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { NavService } from '@layout/navbar/nav.service';
import { NAV_CATEGORIES } from '@layout/navbar/nav.data';
import { NavManagerHeaderComponent } from './components/nav-manager-header/nav-manager-header.component';
import { NavCategoryListComponent } from './components/nav-category-list/nav-category-list.component';
import { NavCategoryDetailsComponent } from './components/nav-category-details/nav-category-details.component';
import { NavMegaMenuEditorComponent } from './components/nav-mega-menu-editor/nav-mega-menu-editor.component';
import { NavigationDraftService } from './services/navigation-draft.service';
import { NavigationDialogService } from './services/navigation-dialog.service';
import { validateNavigationDraft } from './utils/navigation-manager.validator';

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
  readonly #dialogs = inject(NavigationDialogService);
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

  // --- Category Dialog Handlers ---
  async openAddCategoryDialog(): Promise<void> {
    const result = await this.#dialogs.openAddCategory();
    if (result) this.draft.addCategory(result);
  }

  async confirmDeleteCategory(id: string): Promise<void> {
    const cat = this.draft.draftCategories().find((c) => c.id === id);
    if (await this.#dialogs.confirmDeleteCategory(cat?.label || 'Untitled Category')) {
      this.draft.deleteCategory(id);
    }
  }

  // --- Column Dialog Handlers ---
  async openAddColumnDialog(): Promise<void> {
    const result = await this.#dialogs.openAddColumn(this.draft.selectedCategory()?.label);
    if (result) this.draft.addColumn(result);
  }

  async confirmDeleteColumn(colIndex: number): Promise<void> {
    const col = this.draft.selectedCategory()?.megaMenu?.[colIndex];
    const confirmed = await this.#dialogs.confirmDeleteColumn(
      col?.title || `Column ${colIndex + 1}`,
      col?.links?.length ?? 0,
    );
    if (confirmed) this.draft.deleteColumn(colIndex);
  }

  // --- Link Dialog Handlers ---
  async openAddLinkDialog(colIndex: number): Promise<void> {
    const current = this.draft.selectedCategory();
    const col = current?.megaMenu?.[colIndex];
    const result = await this.#dialogs.openAddLink(
      col?.title || `Column ${colIndex + 1}`,
      current?.path,
    );
    if (result) this.draft.addLink(colIndex, result);
  }

  async confirmDeleteLink(colIndex: number, linkIndex: number): Promise<void> {
    const link = this.draft.selectedCategory()?.megaMenu?.[colIndex]?.links?.[linkIndex];
    if (await this.#dialogs.confirmDeleteLink(link?.label || `Link ${linkIndex + 1}`)) {
      this.draft.deleteLink(colIndex, linkIndex);
    }
  }

  // --- Header Persistence Actions ---
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
    const confirmed = await this.#dialogs.confirmResetDefaults();
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

  async discardDraft(): Promise<void> {
    if (this.draft.isDraftDirty()) {
      const confirmed = await this.#dialogs.confirmDiscardDraft();
      if (!confirmed) return;
    }
    this.draft.discardDraft(this.#navService.categories());
  }
}
