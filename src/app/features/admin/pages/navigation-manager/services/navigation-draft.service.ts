import { computed, inject, Service, signal } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  MegaMenuColumn,
  MegaMenuLink,
  NavCategory,
  navAutoColumnLinks,
  type NavAutoColumn,
  type NavTarget,
} from '@core/services/navigation';
import { CatalogService } from '@core/services/products/catalog.service';
import { normalizePath } from '../utils/navigation-manager.utils';
import { withTargetPaths } from '../utils/navigation-targets.utils';
import { NavigationCatalogService } from './navigation-catalog.service';
import type { NavTargetChange } from '../components/nav-target-field/nav-target-field.component';

/** What an add dialog hands back for a menu or link destination. */
export interface NavDestination {
  readonly target: NavTarget | null;
  readonly path: string;
}

@Service()
export class NavigationDraftService {
  readonly #snackbar = inject(SnackbarService);
  readonly #catalog = inject(CatalogService);
  readonly #allCatalog = inject(NavigationCatalogService);

  /** The categories to save: each target's address rebuilt, old typed addresses turned into targets. */
  categoriesToSave(): NavCategory[] {
    return withTargetPaths(this.draftCategories(), this.#allCatalog.bestCatalog());
  }

  readonly draftCategories = signal<NavCategory[]>([]);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly isDraftDirty = signal<boolean>(false);

  readonly selectedCategory = computed(() => {
    const id = this.selectedCategoryId();
    if (!id) return this.draftCategories()[0] ?? null;
    return this.draftCategories().find((c) => c.id === id) ?? null;
  });

  resetDraftFromSource(source: readonly NavCategory[]): void {
    const cloned = structuredClone(source) as NavCategory[];
    this.draftCategories.set(cloned);
    const currentSelected = this.selectedCategoryId();
    if (cloned.length > 0 && (!currentSelected || !cloned.some((c) => c.id === currentSelected))) {
      this.selectedCategoryId.set(cloned[0].id);
    }
  }

  /** Opens a saved version as an unsaved draft (Previous Versions, ATS-251). */
  loadVersion(source: readonly NavCategory[]): void {
    this.resetDraftFromSource(source);
    this.isDraftDirty.set(true);
  }

  // --- Category Management ---
  selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
  }

  addCategory(data?: { label: string } & Partial<NavDestination>): void {
    this.isDraftDirty.set(true);
    const newId = `cat-${crypto.randomUUID().slice(0, 8)}`;
    const label = data?.label?.trim() ?? '';
    const path = data?.path?.trim() ? normalizePath(data.path) : '';

    // No target and no path: the name only opens its menu.
    const newCat: NavCategory = {
      id: newId,
      label,
      ...(path ? { path } : {}),
      ...(data?.target ? { target: data.target } : {}),
      megaMenu: [],
    };

    this.draftCategories.update((list) => [...list, newCat]);
    this.selectedCategoryId.set(newId);
    this.#snackbar.info(label ? `Category "${label}" added to draft.` : 'New category added to draft.');
  }

  deleteCategory(id: string): void {
    this.isDraftDirty.set(true);
    this.draftCategories.update((list) => list.filter((c) => c.id !== id));
    if (this.selectedCategoryId() === id) {
      const remaining = this.draftCategories();
      this.selectedCategoryId.set(remaining.length > 0 ? remaining[0].id : null);
    }
    this.#snackbar.info('Category removed from draft.');
  }

  moveCategory(index: number, direction: 'up' | 'down'): void {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const list = [...this.draftCategories()];
    if (targetIndex < 0 || targetIndex >= list.length) return;

    this.isDraftDirty.set(true);
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);
    this.draftCategories.set(list);
  }

  dropCategory(event: CdkDragDrop<NavCategory[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.isDraftDirty.set(true);
    const list = [...this.draftCategories()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.draftCategories.set(list);
  }

  // --- Selected Category Mutators ---
  #updateSelectedCategory(updater: (category: NavCategory) => NavCategory): void {
    const current = this.selectedCategory();
    if (!current) return;

    this.isDraftDirty.set(true);
    this.draftCategories.update((list) => list.map((c) => (c.id === current.id ? updater(c) : c)));
  }

  #updateColumns(updater: (columns: MegaMenuColumn[]) => MegaMenuColumn[]): void {
    this.#updateSelectedCategory((cat) => ({
      ...cat,
      megaMenu: updater(cat.megaMenu ?? []),
    }));
  }

  updateCategoryBasic(field: 'label' | 'path', value: unknown): void {
    this.#updateSelectedCategory((cat) => ({ ...cat, [field]: value }));
  }

  /** Links To changed: save the target and its address; an empty label takes the target's name. */
  updateCategoryTarget(change: NavTargetChange): void {
    this.#updateSelectedCategory((cat) => {
      const next: NavCategory = { ...cat };
      if (change.target) next.target = change.target;
      else delete next.target;
      if (change.path) next.path = change.path;
      else delete next.path;
      if (!next.label.trim() && change.name) next.label = change.name;
      return next;
    });
  }

  // --- Mega Menu Column Management ---
  addColumn(data?: { title: string }): void {
    const title = data?.title?.trim() ?? '';
    this.#updateColumns((cols) => [...cols, { title, links: [] }]);
    this.#snackbar.info(title ? `Column "${title}" added to mega menu.` : 'New column added to mega menu.');
  }

  deleteColumn(colIndex: number): void {
    this.#updateColumns((cols) => cols.filter((_, idx) => idx !== colIndex));
  }

  updateColumnTitle(colIndex: number, title: string): void {
    this.#updateColumns((cols) => cols.map((col, idx) => (idx === colIndex ? { ...col, title } : col)));
  }

  /**
   * Fill Automatically on (an auto setting) or off (null). The column's own links stay in the
   * draft either way, so turning it off brings them back (ATS-247).
   */
  setColumnAuto(colIndex: number, auto: NavAutoColumn | null): void {
    this.#updateColumns((cols) =>
      cols.map((col, idx) => {
        if (idx !== colIndex) return col;
        const next: MegaMenuColumn = { ...col };
        if (auto) next.auto = auto;
        else delete next.auto;
        return next;
      }),
    );
  }

  /** What a Fill Automatically column shows on the store now, for the editor's preview. */
  autoPreview(auto: NavAutoColumn): MegaMenuLink[] {
    return navAutoColumnLinks(auto, this.#allCatalog.autoSources(), (path) => this.#catalog.isEmpty(path));
  }

  dropColumn(event: CdkDragDrop<MegaMenuColumn[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.#updateColumns((cols) => {
      const copy = [...cols];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return copy;
    });
  }

  // --- Link Management ---
  addLink(
    colIndex: number,
    data?: { label: string; badge?: string; isBrand?: boolean } & Partial<NavDestination>,
  ): void {
    const label = data?.label?.trim() ?? '';
    const path = data?.path?.trim() ? normalizePath(data.path) : '';
    const badge = data?.badge?.trim() ? data.badge.trim() : undefined;
    const isBrand = data?.isBrand;

    const newLink: MegaMenuLink = {
      label,
      path,
      ...(data?.target ? { target: data.target } : {}),
      ...(badge ? { badge } : {}),
      ...(isBrand ? { isBrand: true } : {}),
    };

    this.#updateColumns((cols) =>
      cols.map((col, idx) => (idx === colIndex ? { ...col, links: [...col.links, newLink] } : col)),
    );
    this.#snackbar.info(label ? `Link "${label}" added to column.` : 'New link added to column.');
  }

  deleteLink(colIndex: number, linkIndex: number): void {
    this.#updateColumns((cols) =>
      cols.map((col, idx) =>
        idx === colIndex ? { ...col, links: col.links.filter((_, lIdx) => lIdx !== linkIndex) } : col,
      ),
    );
  }

  dropLink(colIndex: number, event: CdkDragDrop<MegaMenuLink[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.#updateColumns((cols) =>
      cols.map((col, idx) => {
        if (idx !== colIndex) return col;
        const links = [...col.links];
        moveItemInArray(links, event.previousIndex, event.currentIndex);
        return { ...col, links };
      }),
    );
  }

  /** Links To changed on a link: save the target and its address; an empty label takes its name. */
  updateLinkTarget(colIndex: number, linkIndex: number, change: NavTargetChange): void {
    this.#updateColumns((cols) =>
      cols.map((col, cIdx) => {
        if (cIdx !== colIndex) return col;
        const links = col.links.map((link, lIdx) => {
          if (lIdx !== linkIndex) return link;
          const next: MegaMenuLink = { ...link, path: change.path };
          if (change.target) next.target = change.target;
          else delete next.target;
          if (!next.label.trim() && change.name) next.label = change.name;
          return next;
        });
        return { ...col, links };
      }),
    );
  }

  updateLinkField(colIndex: number, linkIndex: number, field: keyof MegaMenuLink, value: unknown): void {
    const current = this.selectedCategory();
    if (!current) return;

    // Editing a label or the Brand box never rewrites the address: only ✨ fills it, from real categories.
    this.#updateColumns((cols) =>
      cols.map((col, cIdx) => {
        if (cIdx !== colIndex) return col;
        const updatedLinks = col.links.map((link, lIdx) => {
          if (lIdx !== linkIndex) return link;
          const updatedLink: MegaMenuLink = { ...link, [field]: value };
          if (!updatedLink.isBrand) {
            delete updatedLink.isBrand;
          }
          if (!updatedLink.badge) {
            delete updatedLink.badge;
          }
          return updatedLink;
        });
        return { ...col, links: updatedLinks };
      }),
    );
  }

  markSaved(): void {
    this.isDraftDirty.set(false);
  }

  discardDraft(source: readonly NavCategory[]): void {
    this.isDraftDirty.set(false);
    this.resetDraftFromSource(source);
    this.#snackbar.info('Draft discarded. Restored from current active data.');
  }
}
