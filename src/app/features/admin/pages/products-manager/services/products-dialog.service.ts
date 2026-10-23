import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import type { Product } from '@core/services/products/product.model';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '@shared/ui/dialogs/confirm-dialog/confirm-dialog.component';
import { CatalogMigrateDialogComponent } from '../dialogs/catalog-migrate-dialog/catalog-migrate-dialog.component';
import { ImportPreviewDialogComponent } from '../dialogs/import-preview-dialog/import-preview-dialog.component';
import {
  ProductEditDialogComponent,
  ProductEditDialogData,
} from '../dialogs/product-edit-dialog/product-edit-dialog.component';
import type {
  BrandOptionView,
  CategoryOptionView,
  ImportReport,
  MigrateReport,
  ProductEditDraft,
  ReindexSearchReport,
} from '../models/product-admin.model';

@Service()
export class ProductsDialogService {
  readonly #dialog = inject(MatDialog);

  async confirmImport(): Promise<boolean> {
    const dialogRef = this.#dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        data: {
          title: 'Import from EasyOrders',
          message:
            'This copies 104 products and their photos from your EasyOrders store. Products you edited here keep your changes.',
          confirmText: 'Import',
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

  async openPreview(report: ImportReport): Promise<void> {
    const dialogRef = this.#dialog.open<ImportPreviewDialogComponent, ImportReport>(
      ImportPreviewDialogComponent,
      {
        data: report,
        width: '960px',
        maxWidth: '96vw',
        maxHeight: '90vh',
      },
    );
    await firstValueFrom(dialogRef.afterClosed());
  }

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
          confirmText: 'Rebuild search',
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

  async openEdit(
    product: Product,
    groups: readonly string[],
    categories: readonly CategoryOptionView[],
    brands: readonly BrandOptionView[],
  ): Promise<ProductEditDraft | null> {
    const dialogRef = this.#dialog.open<
      ProductEditDialogComponent,
      ProductEditDialogData,
      ProductEditDraft | null
    >(ProductEditDialogComponent, {
      data: { product, groups, categories, brands },
      width: '480px',
      maxWidth: '92vw',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    return result ?? null;
  }
}
