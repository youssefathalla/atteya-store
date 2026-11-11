import { Component, computed, effect, inject, OnInit, PLATFORM_ID, resource, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { SeoService } from '@core/services/seo';
import { ProductCacheService } from '@core/services/products/product-cache.service';
import type { Product } from '@core/services/products/product.model';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { ProductsTableComponent } from './components/products-table/products-table.component';
import { ProductsToolbarComponent } from './components/products-toolbar/products-toolbar.component';
import type { MigratePass, ProductListView } from './models/product-admin.model';
import { CatalogToolsService } from './services/catalog-tools.service';
import { ProductsAdminService } from './services/products-admin.service';
import { ProductsDialogService } from './services/products-dialog.service';
import { importActionError } from './utils/import-error';
import { filterProductRows, toProductTableRow } from './utils/product-admin.utils';
import { countListViews, groupProductRows, matchesListView } from './utils/product-groups.utils';

@Component({
  selector: 'app-products-manager',
  host: { class: 'block w-full' },
  imports: [ProductsToolbarComponent, ProductsTableComponent],
  templateUrl: './products-manager.component.html',
})
export class ProductsManagerComponent implements OnInit {
  readonly #seo = inject(SeoService);
  readonly #router = inject(Router);
  readonly #admin = inject(ProductsAdminService);
  readonly #dialogs = inject(ProductsDialogService);
  readonly #tools = inject(CatalogToolsService);
  readonly #snackbar = inject(SnackbarService);
  readonly #productCache = inject(ProductCacheService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly search = signal('');
  readonly debouncedSearch = signal('');
  readonly typeId = signal('all');
  readonly brandId = signal('all');
  readonly view = signal<ProductListView>('all');
  readonly searchSyncErrors = signal(0);

  /** The whole catalogue, so every colour of a model lands in the same row. */
  readonly catalogResource = resource({
    loader: async () => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { products: [], categories: [], brands: [] };
      }
      const [products, categories, brands] = await Promise.all([
        this.#admin.listAllProducts(),
        this.#admin.listAllCategories(),
        this.#admin.listAllBrands(),
      ]);
      return { products, categories, brands };
    },
  });

  readonly #allRows = computed(() => {
    const data = this.catalogResource.value();
    if (!data) return [];
    const categoryNames = new Map(data.categories.map((cat) => [cat.id, cat.name]));
    const brandNames = new Map(data.brands.map((brand) => [brand.id, brand.name]));
    return data.products.map((product) => toProductTableRow(product, categoryNames, brandNames));
  });

  readonly #filteredRows = computed(() =>
    filterProductRows(this.#allRows(), this.debouncedSearch(), this.typeId(), this.brandId()),
  );

  readonly counts = computed(() => countListViews(this.#filteredRows()));

  readonly groups = computed(() => {
    const view = this.view();
    return groupProductRows(this.#filteredRows().filter((row) => matchesListView(row, view)));
  });

  readonly activity = computed<'tools' | null>(() => (this.#tools.busy() ? 'tools' : null));

  readonly hasActiveFilters = computed(
    () =>
      this.typeId() !== 'all' ||
      this.brandId() !== 'all' ||
      this.view() !== 'all' ||
      this.debouncedSearch().trim().length > 0,
  );

  readonly catalogueEmpty = computed(() => this.catalogResource.hasValue() && this.#allRows().length === 0);

  readonly loadError = computed(() => {
    const error = this.catalogResource.error();
    return error ? importActionError(error) : '';
  });

  readonly showSkeleton = computed(
    () => this.catalogResource.isLoading() && !this.catalogResource.hasValue(),
  );

  readonly tableLoading = computed(() => this.catalogResource.isLoading());

  constructor() {
    effect((onCleanup) => {
      const term = this.search();
      const handle = setTimeout(() => this.debouncedSearch.set(term), 300);
      onCleanup(() => clearTimeout(handle));
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Products | Atteya Admin',
      description: 'Add and edit store products.',
      noindex: true,
    });
    if (isPlatformBrowser(this.#platformId)) {
      void this.reloadSearchSyncErrors();
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

  /** Default weight per category, products without a weight, and Fill Empty Weights. */
  openShippingWeights(): void {
    if (this.activity()) return;
    this.#dialogs.openShippingWeights();
  }

  addProduct(): void {
    if (this.activity()) return;
    void this.#router.navigate(['/admin/products/new']);
  }

  editProduct(id: string): void {
    if (this.activity()) return;
    void this.#router.navigate(['/admin/products', id]);
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
      this.#productCache.clear();
      const outOfStock = result.inStock ? '' : ' (out of stock)';
      this.#snackbar.success(`Stock saved. Total ${result.stock}${outOfStock}.`);
      await this.reloadCatalogue();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  private async reloadCatalogue(): Promise<void> {
    this.catalogResource.reload();
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
