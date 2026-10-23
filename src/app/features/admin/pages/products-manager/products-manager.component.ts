import { Component, computed, inject, OnInit, PLATFORM_ID, resource, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { ProductsTableComponent } from './components/products-table/products-table.component';
import { ProductsToolbarComponent } from './components/products-toolbar/products-toolbar.component';
import type { MigratePass } from './models/product-admin.model';
import { CatalogToolsService } from './services/catalog-tools.service';
import { ProductsAdminService } from './services/products-admin.service';
import { ProductsDialogService } from './services/products-dialog.service';
import { ProductsImportService } from './services/products-import.service';
import { importActionError } from './utils/import-error';
import {
  existingModelGroups,
  filterProductRows,
  importSummary,
  toProductTableRow,
} from './utils/product-admin.utils';

@Component({
  selector: 'app-products-manager',
  host: { class: 'block w-full' },
  imports: [ProductsToolbarComponent, ProductsTableComponent],
  templateUrl: './products-manager.component.html',
})
export class ProductsManagerComponent implements OnInit {
  readonly #seo = inject(SeoService);
  readonly #admin = inject(ProductsAdminService);
  readonly #dialogs = inject(ProductsDialogService);
  readonly #importer = inject(ProductsImportService);
  readonly #tools = inject(CatalogToolsService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly search = signal('');
  readonly typeId = signal('all');
  readonly brandId = signal('all');

  readonly productsResource = resource({
    loader: async () => {
      if (!isPlatformBrowser(this.#platformId)) return [];
      return this.#admin.listProducts();
    },
  });

  readonly activity = computed<'preview' | 'import' | 'tools' | null>(() => {
    const mode = this.#importer.mode();
    if (mode) return mode;
    return this.#tools.busy() ? 'tools' : null;
  });
  readonly progressLabel = this.#importer.progressLabel;
  readonly progressValue = this.#importer.progressValue;

  readonly rows = computed(() =>
    filterProductRows(
      (this.productsResource.value() ?? []).map(toProductTableRow),
      this.search(),
      this.typeId(),
      this.brandId(),
    ),
  );

  readonly loadError = computed(() => {
    const error = this.productsResource.error();
    return error ? importActionError(error) : '';
  });

  readonly showSkeleton = computed(
    () => this.productsResource.isLoading() && !this.productsResource.hasValue(),
  );

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Products | Atteya Admin',
      description: 'Review store products and bring them in from EasyOrders.',
      noindex: true,
    });
  }

  async previewImport(): Promise<void> {
    if (this.activity()) return;
    try {
      const report = await this.#importer.run(true);
      await this.#dialogs.openPreview(report);
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  async importProducts(): Promise<void> {
    if (this.activity()) return;
    const confirmed = await this.#dialogs.confirmImport();
    if (!confirmed) return;
    try {
      const report = await this.#importer.run(false);
      this.#snackbar.success(importSummary(report));
      this.productsResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  async runMigration(pass: MigratePass): Promise<void> {
    if (this.activity()) return;
    try {
      const preview = await this.#tools.migrateCatalog(pass, true);
      const shouldApply = await this.#dialogs.openMigratePreview(preview);
      if (!shouldApply) return;
      const applied = await this.#tools.migrateCatalog(pass, false);
      const message =
        pass === 'add'
          ? `Catalogue structure updated (${applied.products.updated} products updated).`
          : `Old fields removed from ${applied.products.updated} products.`;
      this.#snackbar.success(message);
      this.productsResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  async editProduct(id: string): Promise<void> {
    const products = this.productsResource.value() ?? [];
    const product = products.find((item) => item.id === id);
    if (!product || this.activity()) return;
    const next = await this.#dialogs.openEdit(product, existingModelGroups(products));
    if (!next) return;
    try {
      const changed = await this.#admin.saveProduct(product, next);
      this.#snackbar.success(changed ? 'Product saved.' : 'No changes to save.');
      if (changed) this.productsResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }
}
