import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SeoService } from '@core/services/seo';
import { ProductCacheService } from '@core/services/products/product-cache.service';
import type { Product } from '@core/services/products/product.model';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { ProductsTableComponent } from './components/products-table/products-table.component';
import { ProductsToolbarComponent } from './components/products-toolbar/products-toolbar.component';
import type {
  MigratePass,
  ProductGroupRow,
  ProductListView,
  ProductTableRow,
} from './models/product-admin.model';
import { CatalogToolsService } from './services/catalog-tools.service';
import { ProductsAdminService } from './services/products-admin.service';
import { ProductsDialogService } from './services/products-dialog.service';
import { importActionError } from './utils/import-error';
import {
  buildBrandOptions,
  buildCategoryFilterOptions,
  categoryPathLabel,
  filterProductRows,
  productCountLabel,
  toProductTableRow,
} from './utils/product-admin.utils';
import { countListViews, groupProductRows, matchesListView } from './utils/product-groups.utils';

@Component({
  selector: 'app-products-manager',
  host: { class: 'block w-full' },
  imports: [ProductsToolbarComponent, ProductsTableComponent, MatButtonModule],
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
  /** `?category=<id>` (Categories & Brands' See These Products opens the page with it, ATS-265). */
  readonly category = input<string | undefined>(undefined);
  /** The Category filter: the address's category, until the person picks another. */
  readonly categoryId = linkedSignal(() => this.category()?.trim() || 'all');
  readonly view = signal<ProductListView>('all');
  readonly searchSyncErrors = signal(0);
  /** Product whose Live / Hidden change is saving. */
  readonly switchingId = signal<string | null>(null);

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

  /** Brand filter: the brand docs from Categories & Brands (built-in brands until they load). */
  readonly brandOptions = computed(() => buildBrandOptions(this.catalogResource.value()?.brands ?? []));

  /** Category filter: every category doc, hidden ones marked (ATS-265). */
  readonly categoryOptions = computed(() =>
    buildCategoryFilterOptions(this.catalogResource.value()?.categories ?? []),
  );

  readonly #filteredRows = computed(() =>
    filterProductRows(
      this.#allRows(),
      this.debouncedSearch(),
      this.typeId(),
      this.brandId(),
      this.categoryId(),
    ),
  );

  readonly counts = computed(() => countListViews(this.#filteredRows()));

  readonly groups = computed(() => {
    const view = this.view();
    return groupProductRows(this.#filteredRows().filter((row) => matchesListView(row, view)));
  });

  /** Ticked product (colour) ids for Move to Category (ATS-266). */
  readonly #ticked = signal<ReadonlySet<string>>(new Set());

  /** Ticked ids that are still in the catalogue (a deleted product drops out). */
  readonly selectedIds = computed<ReadonlySet<string>>(() => {
    const ticked = this.#ticked();
    if (ticked.size === 0) return ticked;
    const known = new Set(this.#allRows().map((row) => row.id));
    return new Set([...ticked].filter((id) => known.has(id)));
  });

  readonly selectedLabel = computed(() => `${productCountLabel(this.selectedIds().size)} selected`);

  /** Every colour the current filters show. */
  readonly #shownIds = computed(() => this.groups().flatMap((group) => group.colours.map((c) => c.id)));

  readonly allShownSelected = computed(() => {
    const shown = this.#shownIds();
    const selected = this.selectedIds();
    return shown.length > 0 && shown.every((id) => selected.has(id));
  });

  readonly activity = computed<'tools' | null>(() => (this.#tools.busy() ? 'tools' : null));

  readonly showSelectionBar = computed(
    () => this.catalogResource.hasValue() && (this.groups().length > 0 || this.selectedIds().size > 0),
  );

  readonly selectAllDisabled = computed(
    () => this.activity() !== null || this.groups().length === 0 || this.allShownSelected(),
  );

  readonly hasActiveFilters = computed(
    () =>
      this.typeId() !== 'all' ||
      this.brandId() !== 'all' ||
      this.categoryId() !== 'all' ||
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

  /** Picks a category and keeps it in the address (`?category=`), so a reload or a link keeps it. */
  setCategory(id: string): void {
    this.categoryId.set(id);
    void this.#router.navigate([], {
      queryParams: { category: id === 'all' ? null : id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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

  async switchPublished(row: ProductTableRow): Promise<void> {
    if (this.activity() || this.switchingId()) return;
    const published = !row.published;
    if (!(await this.#dialogs.confirmPublished(row, published))) return;
    this.switchingId.set(row.id);
    try {
      await this.#admin.setPublished(row.id, published);
      this.#productCache.clear();
      this.#snackbar.success(published ? 'Now live on the store.' : 'Hidden from the store.');
      await this.reloadCatalogue();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    } finally {
      this.switchingId.set(null);
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
      this.#productCache.clear();
      const outOfStock = result.inStock ? '' : ' (out of stock)';
      this.#snackbar.success(`Stock saved. Total ${result.stock}${outOfStock}.`);
      await this.reloadCatalogue();
    } catch (error: unknown) {
      this.#snackbar.error(importActionError(error));
    }
  }

  toggleSelected(row: ProductGroupRow): void {
    const ids = row.colours.map((colour) => colour.id);
    this.#ticked.update(() => {
      const next = new Set(this.selectedIds());
      const allTicked = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allTicked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  /** Ticks every colour the current filters show (keeps ticks from other filters). */
  selectAllShown(): void {
    this.#ticked.set(new Set([...this.selectedIds(), ...this.#shownIds()]));
  }

  clearSelection(): void {
    this.#ticked.set(new Set());
  }

  async moveToCategory(): Promise<void> {
    if (this.activity()) return;
    const data = this.catalogResource.value();
    const productIds = [...this.selectedIds()];
    if (!data || productIds.length === 0) return;
    const labelFor = (id: string): string => categoryPathLabel(data.categories, id);
    const chosen = new Set(productIds);
    const currentLabels = this.#allRows()
      .filter((row) => chosen.has(row.id))
      .map((row) => labelFor(row.categoryId));
    const result = await this.#dialogs.openMoveCategory({
      productIds,
      options: this.categoryOptions(),
      labelFor,
      currentLabels,
      move: (categoryId) => this.#admin.moveToCategory(productIds, categoryId),
    });
    if (!result) return;
    this.clearSelection();
    const moved = result.moved + result.unchanged;
    const missing = result.missing > 0 ? ` ${productCountLabel(result.missing)} no longer existed.` : '';
    this.#snackbar.success(`Moved ${productCountLabel(moved)} to ${result.categoryLabel}.${missing}`);
    await this.reloadCatalogue();
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
