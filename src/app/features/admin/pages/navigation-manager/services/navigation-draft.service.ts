import { computed, inject, Service, signal } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { MegaMenuColumn, MegaMenuLink, NavCategory } from '@core/services/navigation';
import { CatalogService } from '@core/services/products/catalog.service';
import { SEED_BRANDS, SEED_CATEGORIES } from '@core/services/products/catalog-taxonomy';
import {
  normalizePath,
  noNavPathMessage,
  suggestNavPath,
  type NavCatalog,
} from '../utils/navigation-manager.utils';

@Service()
export class NavigationDraftService {
  readonly #snackbar = inject(SnackbarService);
  readonly #catalog = inject(CatalogService);

  /** Live published categories and brands (the built-in list until they load). */
  catalogForPaths(): NavCatalog {
    const categories = this.#catalog.categories() ?? [];
    const brands = this.#catalog.brands() ?? [];
    return {
      categories: categories.length ? categories : SEED_CATEGORIES.filter((item) => item.published !== false),
      brands: brands.length ? brands : SEED_BRANDS.filter((item) => item.published !== false),
    };
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

  // --- Category Management ---
  selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
  }

  addCategory(data?: { label: string; path: string }): void {
    this.isDraftDirty.set(true);
    const newId = `cat-${crypto.randomUUID().slice(0, 8)}`;
    const label = data?.label?.trim() ?? '';
    const path = data?.path?.trim() ? normalizePath(data.path) : `/category/${newId}`;

    const newCat: NavCategory = {
      id: newId,
      label,
      path,
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

  updateCategoryPath(rawPath: string): void {
    this.#updateSelectedCategory((cat) => ({
      ...cat,
      path: normalizePath(rawPath),
    }));
  }

  generateCategoryPath(): void {
    const current = this.selectedCategory();
    if (!current?.label) return;

    const newPath = suggestNavPath(current.label, false, this.catalogForPaths());
    if (!newPath) {
      this.#snackbar.error(noNavPathMessage(current.label));
      return;
    }
    this.updateCategoryPath(newPath);
    this.#snackbar.info(`Address set to "${newPath}".`);
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

  dropColumn(event: CdkDragDrop<MegaMenuColumn[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.#updateColumns((cols) => {
      const copy = [...cols];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return copy;
    });
  }

  // --- Link Management ---
  addLink(colIndex: number, data?: { label: string; path: string; badge?: string; isBrand?: boolean }): void {
    const label = data?.label?.trim() ?? '';
    const path = data?.path?.trim() ? normalizePath(data.path) : '';
    const badge = data?.badge?.trim() ? data.badge.trim() : undefined;
    const isBrand = data?.isBrand;

    const newLink: MegaMenuLink = {
      label,
      path,
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

  generateLinkSlug(colIndex: number, linkIndex: number): void {
    const current = this.selectedCategory();
    if (!current?.megaMenu) return;
    const link = current.megaMenu[colIndex]?.links[linkIndex];
    if (!link) return;

    const newPath = suggestNavPath(link.label, Boolean(link.isBrand), this.catalogForPaths());
    if (!newPath) {
      this.#snackbar.error(noNavPathMessage(link.label || 'this link'));
      return;
    }
    this.updateLinkField(colIndex, linkIndex, 'path', newPath);
    this.#snackbar.info(`Address set to "${newPath}".`);
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
