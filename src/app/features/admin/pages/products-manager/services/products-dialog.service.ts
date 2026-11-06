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
  ProductStockDialogComponent,
  ProductStockDialogData,
} from '../dialogs/product-stock-dialog/product-stock-dialog.component';
import type {
  MigrateReport,
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

  async confirmReindex(preview: ReindexSearchReport): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Rebuild search',
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
}
