import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import type { Product } from '@core/services/products/product.model';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { CatalogMigrateDialogComponent } from '../dialogs/catalog-migrate-dialog/catalog-migrate-dialog.component';
import {
  MoveCategoryDialogComponent,
  MoveCategoryDialogData,
  MoveCategoryDialogResult,
} from '../dialogs/move-category-dialog/move-category-dialog.component';
import { ProductWeightsDialogComponent } from '../dialogs/product-weights-dialog/product-weights-dialog.component';
import {
  ProductStockDialogComponent,
  ProductStockDialogData,
} from '../dialogs/product-stock-dialog/product-stock-dialog.component';
import type {
  MigrateReport,
  ProductTableRow,
  ReindexSearchReport,
  StockChange,
} from '../models/product-admin.model';

@Service()
export class ProductsDialogService {
  readonly #dialog = inject(MatDialog);

  async openMigratePreview(report: MigrateReport): Promise<boolean> {
    const dialogRef = this.#dialog.open<CatalogMigrateDialogComponent, MigrateReport, boolean>(
      CatalogMigrateDialogComponent,
      {
        data: report,
        width: '760px',
        maxWidth: '96vw',
        maxHeight: '90vh',
      },
    );
    const apply = await firstValueFrom(dialogRef.afterClosed());
    return !!apply;
  }

  openShippingWeights(): void {
    this.#dialog.open(ProductWeightsDialogComponent, {
      width: '640px',
      maxWidth: '96vw',
      maxHeight: '90vh',
    });
  }

  /** Delete one colour of a product for good. */
  async confirmDeleteColour(name: string, onlyColour: boolean): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: onlyColour ? 'Delete This Product?' : 'Delete This Colour?',
          message: `${name} leaves the store, search and this list for good. Past orders keep their copy, and shoppers who saved it see it as no longer available. Changes you haven't saved on this page are lost. This can't be undone.`,
          confirmText: onlyColour ? 'Delete Product' : 'Delete Colour',
          cancelText: 'Keep It',
          theme: 'error',
        },
        width: '480px',
        maxWidth: '92vw',
      },
    );
    return !!(await firstValueFrom(dialogRef.afterClosed()));
  }

  async confirmReindex(preview: ReindexSearchReport): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Rebuild Search',
          message: `This will apply search settings and sync ${preview.indexed} published products to ${preview.indexName}.`,
          confirmText: 'Rebuild Search',
          cancelText: 'Cancel',
          theme: 'primary',
        },
        width: '480px',
        maxWidth: '92vw',
      },
    );
    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    return !!confirmed;
  }

  async confirmPublished(row: ProductTableRow, published: boolean): Promise<boolean> {
    const name = row.colourLabel ? `${row.name} (${row.colourLabel})` : row.name;
    const data: ConfirmDialogData = published
      ? {
          title: 'Show on the Store?',
          message:
            row.stockStatus === 'out' || row.stockStatus === 'unset'
              ? `${name} will be visible to shoppers, but it has no stock, so they can't buy it yet. You can add stock first.`
              : `${name} will be visible to shoppers and they can buy it.`,
          confirmText: 'Make Live',
          cancelText: 'Cancel',
          theme: 'success',
        }
      : {
          title: 'Hide from the Store?',
          message: `Shoppers won't see ${name} anymore. You can make it live again at any time.`,
          confirmText: 'Hide Product',
          cancelText: 'Cancel',
          theme: 'primary',
        };
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      { data, width: '440px', maxWidth: '92vw' },
    );
    return !!(await firstValueFrom(dialogRef.afterClosed()));
  }

  async openStock(product: Product): Promise<StockChange | null> {
    const dialogRef = this.#dialog.open<
      ProductStockDialogComponent,
      ProductStockDialogData,
      StockChange | null
    >(ProductStockDialogComponent, {
      data: { product },
      width: '480px',
      maxWidth: '92vw',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    return result ?? null;
  }

  /** Move to Category (ATS-266); null when closed without moving. */
  async openMoveCategory(data: MoveCategoryDialogData): Promise<MoveCategoryDialogResult | null> {
    const dialogRef = this.#dialog.open<
      MoveCategoryDialogComponent,
      MoveCategoryDialogData,
      MoveCategoryDialogResult | null
    >(MoveCategoryDialogComponent, { data, width: '480px', maxWidth: '92vw', disableClose: true });
    return (await firstValueFrom(dialogRef.afterClosed())) ?? null;
  }
}
