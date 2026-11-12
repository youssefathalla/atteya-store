import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, linkedSignal, PLATFORM_ID, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { Brand } from '@core/services/products/product.model';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import {
  BrandDialogComponent,
  type BrandDialogData,
  type BrandDialogResult,
} from '../../dialogs/brand-dialog/brand-dialog.component';
import { CatalogAdminService } from '../../services/catalog-admin.service';
import { CatalogDeleteFlowService, type DeleteFlowOutcome } from '../../services/catalog-delete-flow.service';
import {
  CATALOG_DIALOG_CONFIG,
  hideConfirmMessage,
  moveWithinLevel,
  shownSnackbar,
  sortBrands,
} from '../../utils/catalog-manager.utils';
import { CatalogRowComponent } from '../catalog-row/catalog-row.component';

/**
 * Categories & Brands → Brands (ATS-264): one compact row per brand, shown or hidden. Drag the
 * handle to reorder; every change goes through the admin callables.
 */
@Component({
  selector: 'app-brands-tab',
  host: { class: 'block w-full' },
  imports: [DragDropModule, MatButtonModule, SharedIconModule, SkeletonComponent, CatalogRowComponent],
  templateUrl: './brands-tab.component.html',
})
export class BrandsTabComponent {
  readonly #catalog = inject(CatalogAdminService);
  readonly #deleteFlow = inject(CatalogDeleteFlowService);
  readonly #dialog = inject(MatDialog);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly listResource = resource({
    loader: async (): Promise<readonly Brand[] | null> =>
      isPlatformBrowser(this.#platformId) ? this.#catalog.listBrands() : null,
  });

  /** The list as shown; a drag reorders it at once, before the save answers. */
  readonly items = linkedSignal(() => this.listResource.value() ?? []);
  readonly brands = computed(() => sortBrands(this.items()));
  /** Rows whose switch or Delete check is running. */
  readonly busyIds = signal<ReadonlySet<string>>(new Set());

  add(): void {
    this.#openEditor(null);
  }

  edit(brand: Brand): void {
    this.#openEditor(brand);
  }

  /** The switch: hides or shows at once; hiding a brand with live products asks first. */
  async toggleShown(brand: Brand): Promise<void> {
    if (this.busyIds().has(brand.id)) return;
    const current = this.items().find((item) => item.id === brand.id) ?? brand;
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

  /** ⋮ Delete (ATS-265): any brand with no products can go, built-in ones too. */
  async remove(brand: Brand): Promise<void> {
    if (this.busyIds().has(brand.id)) return;
    this.#setBusy(brand.id, true);
    let outcome: DeleteFlowOutcome;
    try {
      const current = this.items().find((item) => item.id === brand.id) ?? brand;
      outcome = await this.#deleteFlow.run('brands', {
        id: current.id,
        name: current.name,
        published: current.published,
        address: `/brand/${current.slug}`,
      });
    } finally {
      this.#setBusy(brand.id, false);
    }
    if (outcome === 'deleted') this.listResource.reload();
    if (outcome === 'hide') {
      const current = this.items().find((item) => item.id === brand.id) ?? brand;
      await this.#setShown(current, false);
    }
  }

  /** ⋮ Move Up / Move Down: one place in the list, saved like a drag. */
  async move(brand: Brand, step: -1 | 1): Promise<void> {
    const next = moveWithinLevel(
      this.brands().map((item) => item.id),
      brand.id,
      step,
    );
    if (next) await this.#saveOrder(next);
  }

  async drop(event: CdkDragDrop<unknown>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const ordered = [...this.brands()];
    moveItemInArray(ordered, event.previousIndex, event.currentIndex);
    await this.#saveOrder(ordered.map((item) => item.id));
  }

  /** Shows the new order at once, then saves it through `reorderCatalog`. */
  async #saveOrder(ids: readonly string[]): Promise<void> {
    const positions = new Map(ids.map((id, index) => [id, (index + 1) * 10]));
    this.items.update((list) =>
      list.map((item) => ({ ...item, sortOrder: positions.get(item.id) ?? item.sortOrder })),
    );
    try {
      await this.#catalog.reorder('brands', ids);
      this.#snackbar.success('New order saved.');
    } catch (error: unknown) {
      this.#snackbar.error(callableMessage(error) ?? "We couldn't save the new order. Please try again.");
      this.listResource.reload();
    }
  }

  async #setShown(brand: Brand, show: boolean): Promise<void> {
    this.#setBusy(brand.id, true);
    this.#patch(brand.id, show);
    try {
      await this.#catalog.saveBrand({
        id: brand.id,
        name: brand.name,
        logo: brand.logo,
        published: show,
      });
      this.#snackbar.success(shownSnackbar(brand.name, show));
      // A reload started meanwhile (another save) may have put the old value back.
      this.listResource.reload();
    } catch (error: unknown) {
      this.#patch(brand.id, !show);
      this.#snackbar.error(callableMessage(error) ?? "We couldn't change that. Please try again.");
    } finally {
      this.#setBusy(brand.id, false);
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

  #openEditor(brand: Brand | null): void {
    const ref = this.#dialog.open<BrandDialogComponent, BrandDialogData, BrandDialogResult>(
      BrandDialogComponent,
      {
        ...CATALOG_DIALOG_CONFIG,
        data: { brand, brands: this.items() },
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      if (result === 'delete') {
        if (brand) void this.remove(brand);
        return;
      }
      if (result.menuFailed) {
        this.#snackbar.warning(
          "Saved the brand, but the menu didn't confirm the new link. Check Navigation and add it there only if it's missing.",
          'Close',
          8000,
        );
      } else {
        this.#snackbar.success(
          brand
            ? result.resynced > 0
              ? 'Brand saved. Search shows the new name in a minute.'
              : 'Brand saved.'
            : 'Brand added.',
        );
      }
      this.listResource.reload();
    });
  }
}
