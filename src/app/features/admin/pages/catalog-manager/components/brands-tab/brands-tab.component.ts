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
import { callableMessage, isFirebaseError } from '@shared/utils/firebase/firebase-errors';
import {
  BrandDialogComponent,
  type BrandDialogData,
} from '../../dialogs/brand-dialog/brand-dialog.component';
import { CatalogAdminService, type CatalogDialogResult } from '../../services/catalog-admin.service';
import { brandDeleteBlockedReason, liveCountLabel, sortBrands } from '../../utils/catalog-manager.utils';
import { CatalogRowComponent } from '../catalog-row/catalog-row.component';

/**
 * Categories & Brands → Brands: every brand, shown or hidden. Drag the handle to reorder;
 * every change goes through the admin callables.
 */
@Component({
  selector: 'app-brands-tab',
  host: { class: 'block w-full' },
  imports: [DragDropModule, MatButtonModule, SharedIconModule, SkeletonComponent, CatalogRowComponent],
  templateUrl: './brands-tab.component.html',
})
export class BrandsTabComponent {
  readonly #catalog = inject(CatalogAdminService);
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
  readonly busyId = signal<string | null>(null);

  readonly liveCountLabel = liveCountLabel;

  add(): void {
    this.#openEditor(null);
  }

  edit(brand: Brand): void {
    this.#openEditor(brand);
  }

  async toggleShown(brand: Brand): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(brand.id);
    try {
      await this.#catalog.saveBrand({
        id: brand.id,
        name: brand.name,
        logo: brand.logo,
        published: !brand.published,
      });
      this.#snackbar.success(
        brand.published
          ? `${brand.name} is hidden from the store’s menus and lists.`
          : `${brand.name} is shown on the store.`,
      );
      this.listResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(callableMessage(error) ?? "We couldn't change that. Please try again.");
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(brand: Brand): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(brand.id);
    try {
      const products = await this.#catalog.productsUsing('brands', brand.id);
      const blocked = brandDeleteBlockedReason(brand.id, products);
      if (blocked) {
        this.busyId.set(null);
        await this.#offerHide(brand, blocked);
        return;
      }
      const confirmed = await this.#confirm({
        title: `Delete ${brand.name}?`,
        message: 'It leaves the store and its address stops working. This can’t be undone.',
        confirmText: 'Delete Brand',
        cancelText: 'Keep It',
        theme: 'error',
      });
      if (!confirmed) return;
      await this.#catalog.delete('brands', brand.id);
      this.#snackbar.success(`${brand.name} was deleted.`);
      this.listResource.reload();
    } catch (error: unknown) {
      // The server also checks offers; its reason gets the same Hide offer.
      if (isFirebaseError(error) && error.code === 'functions/failed-precondition') {
        const reason = callableMessage(error);
        if (reason) {
          this.busyId.set(null);
          await this.#offerHide(brand, reason);
          return;
        }
      }
      this.#snackbar.error(callableMessage(error) ?? "We couldn't delete that brand. Please try again.");
    } finally {
      this.busyId.set(null);
    }
  }

  async drop(event: CdkDragDrop<unknown>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const ordered = [...this.brands()];
    moveItemInArray(ordered, event.previousIndex, event.currentIndex);
    const positions = new Map(ordered.map((item, index) => [item.id, (index + 1) * 10]));
    this.items.update((list) =>
      list.map((item) => ({ ...item, sortOrder: positions.get(item.id) ?? item.sortOrder })),
    );
    try {
      await this.#catalog.reorder(
        'brands',
        ordered.map((item) => item.id),
      );
    } catch (error: unknown) {
      this.#snackbar.error(callableMessage(error) ?? "We couldn't save the new order. Please try again.");
      this.listResource.reload();
    }
  }

  async #offerHide(brand: Brand, reason: string): Promise<void> {
    if (!brand.published) {
      this.#snackbar.info(reason, 'Close', 6000);
      return;
    }
    const hide = await this.#confirm({
      title: `${brand.name} can’t be deleted`,
      message: reason,
      confirmText: 'Hide',
      cancelText: 'Keep Shown',
      theme: 'warning',
    });
    if (hide) await this.toggleShown(brand);
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
    const ref = this.#dialog.open<BrandDialogComponent, BrandDialogData, CatalogDialogResult>(
      BrandDialogComponent,
      {
        data: { brand, brands: this.items() },
        width: '36rem',
        maxWidth: '96vw',
        autoFocus: 'first-tabbable',
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      if (result.menuFailed) {
        this.#snackbar.warning(
          "Saved the brand, but couldn't add it to the menu. Add it in Navigation.",
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
