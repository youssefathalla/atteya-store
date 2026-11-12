import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  model,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
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
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import {
  CategoryDialogComponent,
  type CategoryDialogData,
  type CategoryDialogResult,
} from '../../dialogs/category-dialog/category-dialog.component';
import { CatalogRowComponent } from '../catalog-row/catalog-row.component';
import { CatalogAdminService } from '../../services/catalog-admin.service';
import { CatalogDeleteFlowService, type DeleteFlowOutcome } from '../../services/catalog-delete-flow.service';
import {
  buildCategoryTree,
  CATALOG_DIALOG_CONFIG,
  hideConfirmMessage,
  moveWithinLevel,
  shownSnackbar,
} from '../../utils/catalog-manager.utils';

/**
 * Categories & Brands → Categories (ATS-264): one compact row per main category; clicking its
 * name or arrow opens the categories inside it. Drag the handle to reorder within a level; every
 * change goes through the admin callables.
 */
@Component({
  selector: 'app-categories-tab',
  host: { class: 'block w-full' },
  imports: [DragDropModule, MatButtonModule, SharedIconModule, SkeletonComponent, CatalogRowComponent],
  templateUrl: './categories-tab.component.html',
})
export class CategoriesTabComponent {
  readonly #catalog = inject(CatalogAdminService);
  readonly #deleteFlow = inject(CatalogDeleteFlowService);
  readonly #dialog = inject(MatDialog);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly listResource = resource({
    loader: async (): Promise<readonly Category[] | null> =>
      isPlatformBrowser(this.#platformId) ? this.#catalog.listCategories() : null,
  });

  /** The list as shown; a drag or the switch changes it at once, before the save answers. */
  readonly items = linkedSignal(() => this.listResource.value() ?? []);
  readonly tree = computed(() => buildCategoryTree(this.items()));
  /** Open main categories; held by the page, so it stays while the page is open. */
  readonly openIds = model<ReadonlySet<string>>(new Set());
  /** Rows whose switch or Delete check is running. */
  readonly busyIds = signal<ReadonlySet<string>>(new Set());

  add(parentId: string | null): void {
    this.#openEditor(null, parentId);
  }

  edit(category: Category): void {
    this.#openEditor(category, category.parentId);
  }

  toggleOpen(id: string): void {
    this.openIds.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** The switch: hides or shows at once; hiding a category with live products asks first. */
  async toggleShown(category: Category): Promise<void> {
    if (this.busyIds().has(category.id)) return;
    const current = this.items().find((item) => item.id === category.id) ?? category;
    const show = !current.published;
    if (!show) {
      const message = hideConfirmMessage(current.name, current.productCount);
      if (message) {
        const confirmed = await this.#confirm({
          title: `Hide ${current.name}?`,
          message,
          confirmText: 'Hide',
          cancelText: 'Keep Shown',
          theme: 'warning',
        });
        if (!confirmed) return;
      }
    }
    await this.#setShown(current, show);
  }

  /**
   * ⋮ Delete (ATS-265): any category with no products and nothing inside can go, built-in ones
   * too; otherwise the reason comes with See These Products and Hide Instead.
   */
  async remove(category: Category): Promise<void> {
    if (this.busyIds().has(category.id)) return;
    this.#setBusy(category.id, true);
    let outcome: DeleteFlowOutcome;
    try {
      const current = this.items().find((item) => item.id === category.id) ?? category;
      outcome = await this.#deleteFlow.run('categories', {
        id: current.id,
        name: current.name,
        published: current.published,
        address: `/category/${current.path}`,
      });
    } finally {
      this.#setBusy(category.id, false);
    }
    if (outcome === 'deleted') this.listResource.reload();
    if (outcome === 'hide') {
      const current = this.items().find((item) => item.id === category.id) ?? category;
      await this.#setShown(current, false);
    }
  }

  /** ⋮ Move Up / Move Down: one place within its own level, saved like a drag. */
  async move(category: Category, step: -1 | 1): Promise<void> {
    const ids = this.#level(category.parentId ?? null).map((item) => item.id);
    const next = moveWithinLevel(ids, category.id, step);
    if (!next) return;
    await this.#saveOrder(next);
  }

  /**
   * True when the row has a neighbour on that side in its own level (a sub-category whose parent
   * is missing is listed at the top level but is not part of it).
   */
  canMove(category: Category, step: -1 | 1): boolean {
    const ids = this.#level(category.parentId ?? null).map((item) => item.id);
    return moveWithinLevel(ids, category.id, step) !== null;
  }

  /** Drag within one level: the top level (`parentId` null) or the categories inside one. */
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
    if (sameLevel.length === 0) return;
    await this.#saveOrder(sameLevel.map((item) => item.id));
  }

  /** The categories of one level as shown (only the ones that really sit at that level). */
  #level(parentId: string | null): readonly Category[] {
    const rows =
      parentId === null
        ? this.tree().map((row) => row.category)
        : (this.tree().find((row) => row.category.id === parentId)?.children ?? []);
    return rows.filter((item) => (item.parentId ?? null) === parentId);
  }

  /** Shows the new order at once, then saves it through `reorderCatalog`. */
  async #saveOrder(ids: readonly string[]): Promise<void> {
    const positions = new Map(ids.map((id, index) => [id, (index + 1) * 10]));
    this.items.update((list) =>
      list.map((item) =>
        positions.has(item.id) ? { ...item, sortOrder: positions.get(item.id) ?? 0 } : item,
      ),
    );
    try {
      await this.#catalog.reorder('categories', ids);
    } catch (error: unknown) {
      this.#snackbar.error(callableMessage(error) ?? "We couldn't save the new order. Please try again.");
      this.listResource.reload();
    }
  }

  async #setShown(category: Category, show: boolean): Promise<void> {
    this.#setBusy(category.id, true);
    this.#patch(category.id, show);
    try {
      await this.#catalog.saveCategory({
        id: category.id,
        name: category.name,
        parentId: null,
        description: category.description ?? '',
        image: category.image,
        published: show,
      });
      this.#snackbar.success(shownSnackbar(category.name, show));
      // A reload started meanwhile (another save) may have put the old value back.
      this.listResource.reload();
    } catch (error: unknown) {
      this.#patch(category.id, !show);
      this.#snackbar.error(callableMessage(error) ?? "We couldn't change that. Please try again.");
    } finally {
      this.#setBusy(category.id, false);
    }
  }

  #patch(id: string, published: boolean): void {
    this.items.update((list) => list.map((item) => (item.id === id ? { ...item, published } : item)));
  }

  #setBusy(id: string, busy: boolean): void {
    this.busyIds.update((ids) => {
      const next = new Set(ids);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
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

  #openEditor(category: Category | null, parentId: string | null): void {
    const ref = this.#dialog.open<CategoryDialogComponent, CategoryDialogData, CategoryDialogResult>(
      CategoryDialogComponent,
      {
        ...CATALOG_DIALOG_CONFIG,
        data: { category, categories: this.items(), parentId },
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      if (result === 'delete') {
        if (category) void this.remove(category);
        return;
      }
      if (result.menuFailed) {
        this.#snackbar.warning(
          "Saved the category, but the menu didn't confirm the new link. Check Navigation and add it there only if it's missing.",
          'Close',
          8000,
        );
      } else {
        this.#snackbar.success(
          category
            ? result.resynced > 0
              ? 'Category saved. Search shows the new name in a minute.'
              : 'Category saved.'
            : 'Category added.',
        );
      }
      // A category added inside a closed one opens it, so the new row is in view.
      if (!category && parentId) this.openIds.update((open) => new Set(open).add(parentId));
      this.listResource.reload();
    });
  }
}
