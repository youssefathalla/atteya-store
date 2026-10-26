import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SeoService } from '@core/services/seo';
import type { Product } from '@core/services/products/product.model';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { ProductsTableComponent } from './components/products-table/products-table.component';
import { ProductsToolbarComponent } from './components/products-toolbar/products-toolbar.component';
import type { MigratePass } from './models/product-admin.model';
import { CatalogToolsService } from './services/catalog-tools.service';
import { ProductsAdminService } from './services/products-admin.service';
import { ProductsDialogService } from './services/products-dialog.service';
import { ProductsImportService } from './services/products-import.service';
import { ProductsPaginationService } from './services/products-pagination.service';
import { importActionError } from './utils/import-error';
import {
  buildBrandOptions,
  buildLeafCategoryOptions,
  filterProductRows,
  importSummary,
  toProductTableRow,
} from './utils/product-admin.utils';

@Component({
  selector: 'app-products-manager',
  host: { class: 'block w-full' },
  imports: [ProductsToolbarComponent, ProductsTableComponent],
  providers: [ProductsPaginationService],
  templateUrl: './products-manager.component.html',
})
export class ProductsManagerComponent implements OnInit {
  readonly #seo = inject(SeoService);
  readonly #admin = inject(ProductsAdminService);
  readonly pagination = inject(ProductsPaginationService);
  readonly #dialogs = inject(ProductsDialogService);
  readonly #importer = inject(ProductsImportService);
  readonly #tools = inject(CatalogToolsService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly search = signal('');
  readonly debouncedSearch = signal('');
  readonly typeId = signal('all');
  readonly brandId = signal('all');
  readonly searchSyncErrors = signal(0);

  readonly productsResource = resource({
    loader: async () => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { categories: [], brands: [] };
      }
      const [categories, brands] = await Promise.all([
        this.#admin.listAllCategories(),
        this.#admin.listAllBrands(),
      ]);
      return { categories, brands };
    },
  });

  readonly searchResource = resource({
    params: () => ({
      term: this.debouncedSearch().trim(),
      typeId: this.typeId(),
      brandId: this.brandId(),
      ready: isPlatformBrowser(this.#platformId) && this.productsResource.hasValue(),
    }),
    loader: async ({ params }) => {
      if (!params.ready || !params.term) {
        return { rows: [], truncated: false };
      }
      const data = this.productsResource.value();
      const categoryNames = new Map((data?.categories ?? []).map((cat) => [cat.id, cat.name]));
      const brandNames = new Map((data?.brands ?? []).map((brand) => [brand.id, brand.name]));
      const { products, truncated } = await this.#admin.searchProducts(params.term);
      const rows = filterProductRows(
        products.map((product) => toProductTableRow(product, categoryNames, brandNames)),
        '',
        params.typeId,
        params.brandId,
      );
      return { rows, truncated };
    },
  });

  readonly isSearchMode = computed(() => this.debouncedSearch().trim().length > 0);

  readonly activity = computed<'preview' | 'import' | 'tools' | null>(() => {
    const mode = this.#importer.mode();
    if (mode) return mode;
    return this.#tools.busy() ? 'tools' : null;
  });
  readonly progressLabel = this.#importer.progressLabel;
  readonly progressValue = this.#importer.progressValue;

  readonly categoryOptions = computed(() =>
    buildLeafCategoryOptions(this.productsResource.value()?.categories ?? []),
  );

  readonly brandOptions = computed(() =>
    buildBrandOptions(this.productsResource.value()?.brands ?? []),
  );

  readonly rows = computed(() =>
    this.isSearchMode() ? (this.searchResource.value()?.rows ?? []) : this.pagination.items(),
  );

  readonly searchTruncated = computed(
    () => this.isSearchMode() && (this.searchResource.value()?.truncated ?? false),
  );

  readonly hasActiveFilters = computed(
    () => this.typeId() !== 'all' || this.brandId() !== 'all' || this.isSearchMode(),
  );

  readonly catalogueEmpty = computed(() => !this.isSearchMode() && this.pagination.total() === 0);

  readonly loadError = computed(() => {
    const metaError = this.productsResource.error();
    if (metaError) return importActionError(metaError);
    const browseError = this.pagination.error();
    if (!this.isSearchMode() && browseError) return browseError;
    const searchError = this.searchResource.error();
    if (this.isSearchMode() && searchError) return importActionError(searchError);
    return '';
  });

  readonly showSkeleton = computed(() => {
    if (this.productsResource.isLoading() && !this.productsResource.hasValue()) return true;
    if (this.isSearchMode()) {
      return this.searchResource.isLoading() && !this.searchResource.hasValue();
    }
    return this.pagination.isLoading() && this.pagination.items().length === 0;
  });

  readonly tableLoading = computed(() => {
    if (this.isSearchMode()) return this.searchResource.isLoading();
    return this.pagination.isLoading();
  });

  constructor() {
    effect((onCleanup) => {
      const term = this.search();
      const handle = setTimeout(() => this.debouncedSearch.set(term), 300);
      onCleanup(() => clearTimeout(handle));
    });

    effect(() => {
      if (!isPlatformBrowser(this.#platformId)) return;
      const data = this.productsResource.value();
      if (!data) return;
      const typeId = this.typeId();
      const brandId = this.brandId();
      const searchActive = this.debouncedSearch().trim().length > 0;
      untracked(() => {
        const categoryNames = new Map(data.categories.map((cat) => [cat.id, cat.name]));
        const brandNames = new Map(data.brands.map((brand) => [brand.id, brand.name]));
        this.pagination.setNameMaps(categoryNames, brandNames);
        if (searchActive) return;
        void this.pagination.setBrowseFilters(typeId, brandId);
      });
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Products | Atteya Admin',
      description: 'Review store products and bring them in from EasyOrders.',
      noindex: true,
    });
    if (isPlatformBrowser(this.#platformId)) {
      void this.reloadSearchSyncErrors();
    }
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
      await this.reloadCatalogue();
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
      await this.reloadCatalogue();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  async rebuildSearch(): Promise<void> {
    if (this.activity()) return;
    try {
      const preview = await this.#tools.reindexSearch(true);
      const shouldApply = await this.#dialogs.confirmReindex(preview);
      if (!shouldApply) return;
      const applied = await this.#tools.reindexSearch(false);
      this.#snackbar.success(
        `Search rebuilt (${applied.indexed} products indexed, ${applied.deleted} removed).`,
      );
      await this.reloadCatalogue();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  async editProduct(id: string): Promise<void> {
    if (this.activity()) return;
    let product: Product | null;
    try {
      product = await this.#admin.getProduct(id);
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
      return;
    }
    if (!product) {
      this.#snackbar.error('This product no longer exists.');
      await this.reloadCatalogue();
      return;
    }
    let modelGroups: readonly string[] = [];
    try {
      modelGroups = await this.#admin.listModelGroups();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
    const next = await this.#dialogs.openEdit(
      product,
      modelGroups,
      this.categoryOptions(),
      this.brandOptions(),
    );
    if (!next) return;
    try {
      const changed = await this.#admin.saveProduct(product, next);
      this.#snackbar.success(changed ? 'Product saved.' : 'No changes to save.');
      await this.reloadCatalogue();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  async editStock(id: string): Promise<void> {
    if (this.activity()) return;
    let product: Product | null;
    try {
      product = await this.#admin.getProduct(id);
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
      return;
    }
    if (!product) {
      this.#snackbar.error('This product no longer exists.');
      await this.reloadCatalogue();
      return;
    }
    const change = await this.#dialogs.openStock(product);
    if (!change) return;
    try {
      const result = await this.#admin.saveStock(id, change);
      const outOfStock = result.inStock ? '' : ' (out of stock)';
      this.#snackbar.success(`Stock saved. Total ${result.stock}${outOfStock}.`);
      await this.reloadCatalogue();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  private async reloadCatalogue(): Promise<void> {
    this.productsResource.reload();
    await this.pagination.refresh();
    if (this.isSearchMode()) {
      this.searchResource.reload();
    }
    await this.reloadSearchSyncErrors();
  }

  private async reloadSearchSyncErrors(): Promise<void> {
    try {
      this.searchSyncErrors.set(await this.#admin.countSearchSyncErrors());
    } catch {
      this.searchSyncErrors.set(0);
    }
  }
}
