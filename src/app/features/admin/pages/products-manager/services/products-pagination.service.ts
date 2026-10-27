import { computed, Service, signal } from '@angular/core';
import {
  collection,
  endBefore,
  getCountFromServer,
  getDocs,
  limit,
  limitToLast,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  startAt,
  where,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { PRODUCTS_COLLECTION } from '@core/services/products/product.constants';
import type { Product } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import type { PaginationServiceInterface, SortSpec } from '@shared/ui/reusable-table/table.model';
import type { ProductTableRow } from '../models/product-admin.model';
import { toProductTableRow } from '../utils/product-admin.utils';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = new Set([10, 25, 50, 100]);

@Service()
export class ProductsPaginationService implements PaginationServiceInterface<ProductTableRow> {
  readonly #firestore = injectFirestore();
  readonly #converter = createValibotConverter(ProductSchema);

  readonly #typeId = signal('all');
  readonly #brandId = signal('all');
  readonly #categoryNames = signal<ReadonlyMap<string, string>>(new Map());
  readonly #brandNames = signal<ReadonlyMap<string, string>>(new Map());

  readonly #currentPage = signal(1);
  readonly #total = signal(0);
  readonly #isLoading = signal(false);
  readonly #error = signal<string | null>(null);
  readonly #pageDocs = signal<readonly QueryDocumentSnapshot<Product>[]>([]);
  readonly #products = signal<readonly Product[]>([]);
  readonly #loaded = signal(false);
  readonly #requestId = signal(0);

  readonly state = computed(() => ({ limit: this.#pageSize() }));
  readonly #pageSize = signal(DEFAULT_PAGE_SIZE);

  readonly #nameDirection = signal<'asc' | 'desc'>('asc');
  readonly sort = computed((): SortSpec => ({ field: 'name', direction: this.#nameDirection() }));

  readonly items = computed(() => {
    const categoryNames = this.#categoryNames();
    const brandNames = this.#brandNames();
    return this.#products().map((product) => toProductTableRow(product, categoryNames, brandNames));
  });

  readonly products = computed(() => this.#products());

  readonly currentPage = this.#currentPage.asReadonly();
  readonly total = this.#total.asReadonly();
  readonly isLoading = this.#isLoading.asReadonly();
  readonly error = this.#error.asReadonly();

  readonly totalPages = computed(() => {
    const limit = this.#pageSize();
    const total = this.#total();
    if (total === 0) return 1;
    return Math.max(1, Math.ceil(total / limit));
  });

  readonly hasNextPage = computed(() => this.#currentPage() < this.totalPages());
  readonly hasPreviousPage = computed(() => this.#currentPage() > 1);

  setNameMaps(categoryNames: ReadonlyMap<string, string>, brandNames: ReadonlyMap<string, string>): void {
    this.#categoryNames.set(categoryNames);
    this.#brandNames.set(brandNames);
  }

  async setBrowseFilters(typeId: string, brandId: string): Promise<void> {
    const unchanged = typeId === this.#typeId() && brandId === this.#brandId();
    if (this.#loaded() && unchanged) return;
    this.#typeId.set(typeId);
    this.#brandId.set(brandId);
    this.#currentPage.set(1);
    await this.#loadFirstPage();
  }

  async setQuery(_where: unknown[] = [], sorts: SortSpec[] = []): Promise<void> {
    const name = sorts.find((item) => item.field === 'name');
    this.#nameDirection.set(name?.direction ?? 'asc');
    this.#currentPage.set(1);
    await this.#loadFirstPage();
  }

  async setFilter(): Promise<void> {
    this.#currentPage.set(1);
    await this.#loadFirstPage();
  }

  async loadPage(direction: 'next' | 'prev' | 'first' | 'last'): Promise<void> {
    if (this.#isLoading()) return;
    if (direction === 'first') {
      this.#currentPage.set(1);
      await this.#loadFirstPage();
      return;
    }
    if (direction === 'last') {
      await this.#loadLastPage();
      return;
    }
    const docs = this.#pageDocs();
    if (docs.length === 0) return;

    if (direction === 'next') {
      if (!this.hasNextPage()) return;
      const ok = await this.#loadAdjacentPage('next', docs[docs.length - 1]);
      if (ok) this.#currentPage.update((page) => page + 1);
      return;
    }

    if (!this.hasPreviousPage()) return;
    const ok = await this.#loadAdjacentPage('prev', docs[0]);
    if (ok) this.#currentPage.update((page) => page - 1);
  }

  async setPageSize(limitValue: number): Promise<void> {
    const next = PAGE_SIZES.has(limitValue) ? limitValue : DEFAULT_PAGE_SIZE;
    if (next === this.#pageSize()) return;
    this.#pageSize.set(next);
    this.#currentPage.set(1);
    await this.#loadFirstPage();
  }

  async refresh(): Promise<void> {
    const first = this.#pageDocs()[0];
    if (this.#currentPage() <= 1 || !first) {
      await this.#loadFirstPage();
      return;
    }
    await this.#reloadFromCursor(first);
  }

  async reset(): Promise<void> {
    this.#typeId.set('all');
    this.#brandId.set('all');
    this.#pageSize.set(DEFAULT_PAGE_SIZE);
    this.#nameDirection.set('asc');
    this.#currentPage.set(1);
    this.#loaded.set(false);
    await this.#loadFirstPage();
  }

  #filterConstraints(): QueryConstraint[] {
    const constraints: QueryConstraint[] = [];
    const typeId = this.#typeId();
    const brandId = this.#brandId();
    if (typeId !== 'all') constraints.push(where('type', '==', typeId));
    if (brandId !== 'all') constraints.push(where('brandId', '==', brandId));
    return constraints;
  }

  #nameOrder(): QueryConstraint {
    return orderBy('name', this.#nameDirection());
  }

  #productsCollection() {
    return collection(this.#firestore, PRODUCTS_COLLECTION).withConverter(this.#converter);
  }

  #beginRequest(): number {
    const id = this.#requestId() + 1;
    this.#requestId.set(id);
    return id;
  }

  #isCurrentRequest(requestId: number): boolean {
    return requestId === this.#requestId();
  }

  async #refreshTotal(requestId: number): Promise<void> {
    const countQuery = query(this.#productsCollection(), ...this.#filterConstraints());
    const snap = await getCountFromServer(countQuery);
    if (!this.#isCurrentRequest(requestId)) return;
    this.#total.set(snap.data().count);
  }

  async #loadFirstPage(): Promise<void> {
    const requestId = this.#beginRequest();
    this.#isLoading.set(true);
    this.#error.set(null);
    try {
      await this.#refreshTotal(requestId);
      if (!this.#isCurrentRequest(requestId)) return;
      const pageSize = this.#pageSize();
      const pageQuery = query(
        this.#productsCollection(),
        ...this.#filterConstraints(),
        this.#nameOrder(),
        limit(pageSize),
      );
      const snap = await getDocs(pageQuery);
      if (!this.#isCurrentRequest(requestId)) return;
      this.#pageDocs.set(snap.docs);
      this.#products.set(snap.docs.map((docSnap) => docSnap.data()));
      this.#currentPage.set(1);
      this.#loaded.set(true);
    } catch (error: unknown) {
      if (!this.#isCurrentRequest(requestId)) return;
      this.#error.set(error instanceof Error ? error.message : 'Could not load products.');
      this.#products.set([]);
      this.#pageDocs.set([]);
    } finally {
      if (this.#isCurrentRequest(requestId)) {
        this.#isLoading.set(false);
      }
    }
  }

  async #loadLastPage(): Promise<void> {
    const requestId = this.#beginRequest();
    this.#isLoading.set(true);
    this.#error.set(null);
    try {
      await this.#refreshTotal(requestId);
      if (!this.#isCurrentRequest(requestId)) return;
      const total = this.#total();
      const pageSize = this.#pageSize();
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const remainder = total === 0 ? pageSize : total - (totalPages - 1) * pageSize;
      const pageQuery = query(
        this.#productsCollection(),
        ...this.#filterConstraints(),
        this.#nameOrder(),
        limitToLast(remainder),
      );
      const snap = await getDocs(pageQuery);
      if (!this.#isCurrentRequest(requestId)) return;
      this.#pageDocs.set(snap.docs);
      this.#products.set(snap.docs.map((docSnap) => docSnap.data()));
      this.#currentPage.set(totalPages);
      this.#loaded.set(true);
    } catch (error: unknown) {
      if (!this.#isCurrentRequest(requestId)) return;
      this.#error.set(error instanceof Error ? error.message : 'Could not load products.');
    } finally {
      if (this.#isCurrentRequest(requestId)) {
        this.#isLoading.set(false);
      }
    }
  }

  async #loadAdjacentPage(
    direction: 'next' | 'prev',
    cursor: QueryDocumentSnapshot<Product>,
  ): Promise<boolean> {
    const requestId = this.#beginRequest();
    this.#isLoading.set(true);
    this.#error.set(null);
    try {
      const pageSize = this.#pageSize();
      const constraints = this.#filterConstraints();
      const pageQuery =
        direction === 'next'
          ? query(
              this.#productsCollection(),
              ...constraints,
              this.#nameOrder(),
              startAfter(cursor),
              limit(pageSize),
            )
          : query(
              this.#productsCollection(),
              ...constraints,
              this.#nameOrder(),
              endBefore(cursor),
              limitToLast(pageSize),
            );
      const snap = await getDocs(pageQuery);
      if (!this.#isCurrentRequest(requestId)) return false;
      this.#pageDocs.set(snap.docs);
      this.#products.set(snap.docs.map((docSnap) => docSnap.data()));
      return true;
    } catch (error: unknown) {
      if (!this.#isCurrentRequest(requestId)) return false;
      this.#error.set(error instanceof Error ? error.message : 'Could not load products.');
      return false;
    } finally {
      if (this.#isCurrentRequest(requestId)) {
        this.#isLoading.set(false);
      }
    }
  }

  async #reloadFromCursor(first: QueryDocumentSnapshot<Product>): Promise<void> {
    const requestId = this.#beginRequest();
    this.#isLoading.set(true);
    this.#error.set(null);
    try {
      await this.#refreshTotal(requestId);
      if (!this.#isCurrentRequest(requestId)) return;
      if (this.#currentPage() > this.totalPages()) {
        await this.#loadLastPage();
        return;
      }
      const snap = await getDocs(
        query(
          this.#productsCollection(),
          ...this.#filterConstraints(),
          this.#nameOrder(),
          startAt(first),
          limit(this.#pageSize()),
        ),
      );
      if (!this.#isCurrentRequest(requestId)) return;
      if (snap.empty) {
        await this.#loadFirstPage();
        return;
      }
      this.#pageDocs.set(snap.docs);
      this.#products.set(snap.docs.map((docSnap) => docSnap.data()));
      this.#loaded.set(true);
    } catch (error: unknown) {
      if (!this.#isCurrentRequest(requestId)) return;
      this.#error.set(error instanceof Error ? error.message : 'Could not load products.');
    } finally {
      if (this.#isCurrentRequest(requestId)) {
        this.#isLoading.set(false);
      }
    }
  }
}
