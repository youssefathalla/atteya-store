import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, linkedSignal, PLATFORM_ID, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { Category } from '@core/services/products/product.model';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { callableMessage, isFirebaseError } from '@shared/utils/firebase/firebase-errors';
import {
  CategoryDialogComponent,
  type CategoryDialogData,
} from '../../dialogs/category-dialog/category-dialog.component';
import { CatalogRowComponent } from '../catalog-row/catalog-row.component';
import { CatalogAdminService, type CatalogDialogResult } from '../../services/catalog-admin.service';
import {
  buildCategoryTree,
  categoryDeleteBlockedReason,
  liveCountLabel,
} from '../../utils/catalog-manager.utils';

/**
 * Categories & Brands → Categories: every category, shown or hidden, as a two-level tree.
 * Drag the handle to reorder within a level; every change goes through the admin callables.
 */
@Component({
  selector: 'app-categories-tab',
  host: { class: 'block w-full' },
  imports: [DragDropModule, MatButtonModule, SharedIconModule, SkeletonComponent, CatalogRowComponent],
  templateUrl: './categories-tab.component.html',
})
export class CategoriesTabComponent {
  readonly #catalog = inject(CatalogAdminService);
  readonly #dialog = inject(MatDialog);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly listResource = resource({
    loader: async (): Promise<readonly Category[] | null> =>
      isPlatformBrowser(this.#platformId) ? this.#catalog.listCategories() : null,
  });

  /** The list as shown; a drag reorders it at once, before the save answers. */
  readonly items = linkedSignal(() => this.listResource.value() ?? []);
  readonly tree = computed(() => buildCategoryTree(this.items()));
  /** The row whose action is running (Hide / Show / Delete check). */
  readonly busyId = signal<string | null>(null);

  details(category: Category, parent: Category | null): string {
    const count = liveCountLabel(category.productCount);
    return parent ? `${count} · in ${parent.name}` : count;
  }

  add(): void {
    this.#openEditor(null);
  }

  edit(category: Category): void {
    this.#openEditor(category);
  }

  async toggleShown(category: Category): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(category.id);
    try {
      await this.#catalog.saveCategory({
        id: category.id,
        name: category.name,
        parentId: null,
        description: category.description ?? '',
        image: category.image,
        published: !category.published,
      });
      this.#snackbar.success(
        category.published
          ? `${category.name} is hidden from the store’s menus and lists.`
          : `${category.name} is shown on the store.`,
      );
      this.listResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(callableMessage(error) ?? "We couldn't change that. Please try again.");
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(category: Category): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(category.id);
    try {
      const subCategories = this.items().filter((item) => item.parentId === category.id).length;
      const products = await this.#catalog.productsUsing('categories', category.id);
      const blocked = categoryDeleteBlockedReason(category.id, { products, subCategories });
      if (blocked) {
        this.busyId.set(null);
        await this.#offerHide(category, blocked);
        return;
      }
      const confirmed = await this.#confirm({
        title: `Delete ${category.name}?`,
        message: 'It leaves the store and its address stops working. This can’t be undone.',
        confirmText: 'Delete Category',
        cancelText: 'Keep It',
        theme: 'error',
      });
      if (!confirmed) return;
      await this.#catalog.delete('categories', category.id);
      this.#snackbar.success(`${category.name} was deleted.`);
      this.listResource.reload();
    } catch (error: unknown) {
      // The server also checks offers; its reason gets the same Hide offer.
      if (isFirebaseError(error) && error.code === 'functions/failed-precondition') {
        const reason = callableMessage(error);
        if (reason) {
          this.busyId.set(null);
          await this.#offerHide(category, reason);
          return;
        }
      }
      this.#snackbar.error(callableMessage(error) ?? "We couldn't delete that category. Please try again.");
    } finally {
      this.busyId.set(null);
    }
  }

  /** Drag within one level: the top level (`parentId` null) or one parent's sub-categories. */
  async drop(parentId: string | null, event: CdkDragDrop<unknown>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const level =
      parentId === null
        ? this.tree().map((row) => row.category)
        : (this.tree().find((row) => row.category.id === parentId)?.children ?? []);
    const ordered = [...level];
    moveItemInArray(ordered, event.previousIndex, event.currentIndex);
    // A sub-category whose parent is missing is listed at the top level, but it is not part of
    // that level on the server, so it keeps its place and is left out of the save.
    const sameLevel = ordered.filter((item) => (item.parentId ?? null) === parentId);
    const positions = new Map(sameLevel.map((item, index) => [item.id, (index + 1) * 10]));
    if (sameLevel.length === 0) return;
    this.items.update((list) =>
      list.map((item) =>
        positions.has(item.id) ? { ...item, sortOrder: positions.get(item.id) ?? 0 } : item,
      ),
    );
    try {
      await this.#catalog.reorder(
        'categories',
        sameLevel.map((item) => item.id),
      );
    } catch (error: unknown) {
      this.#snackbar.error(callableMessage(error) ?? "We couldn't save the new order. Please try again.");
      this.listResource.reload();
    }
  }

  async #offerHide(category: Category, reason: string): Promise<void> {
    if (!category.published) {
      this.#snackbar.info(reason, 'Close', 6000);
      return;
    }
    const hide = await this.#confirm({
      title: `${category.name} can’t be deleted`,
      message: reason,
      confirmText: 'Hide',
      cancelText: 'Keep Shown',
      theme: 'warning',
    });
    if (hide) await this.toggleShown(category);
  }

  #confirm(data: ConfirmDialogData): Promise<boolean | undefined> {
    const ref = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data,
        width: '28rem',
        maxWidth: '92vw',
      },
    );
    return firstValueFrom(ref.afterClosed());
  }

  #openEditor(category: Category | null): void {
    const ref = this.#dialog.open<CategoryDialogComponent, CategoryDialogData, CatalogDialogResult>(
      CategoryDialogComponent,
      {
        data: { category, categories: this.items() },
        width: '36rem',
        maxWidth: '96vw',
        autoFocus: 'first-tabbable',
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.#snackbar.success(
        category
          ? result.resynced > 0
            ? 'Category saved. Search shows the new name in a minute.'
            : 'Category saved.'
          : 'Category added.',
      );
      if (result.menuFailed) {
        this.#snackbar.warning(
          "Saved the category, but couldn't add it to the menu. Add it in Navigation.",
          'Close',
          8000,
        );
      }
      this.listResource.reload();
    });
  }
}
