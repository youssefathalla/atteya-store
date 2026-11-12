import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import {
  computed,
  inject,
  Injector,
  makeStateKey,
  PLATFORM_ID,
  RESPONSE_INIT,
  Service,
  signal,
  TransferState,
} from '@angular/core';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { SEED_CATEGORIES } from './catalog-taxonomy';
import { CatalogService } from './catalog.service';
import { CATEGORIES_COLLECTION } from './product.constants';
import type { ShopCategorySource } from './utils/shop-categories';

/** Published categories the Shop page needs, sent from the server render to the browser. */
export const SHOP_CATEGORIES_KEY = makeStateKey<readonly ShopCategorySource[]>('shop-categories');

/** A slow read must not hold the page; the built-in categories are used instead. */
const READ_TIMEOUT_MS = 3000;

const ShopCategorySourceSchema = v.object({
  id: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  slug: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  parentId: v.nullable(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))),
  sortOrder: v.pipe(v.number(), v.integer()),
  shopLabel: v.optional(v.pipe(v.string(), v.maxLength(30))),
  published: v.optional(v.boolean()),
});

/** The built-in categories, used when the list can't be read. */
const BUILT_IN: readonly ShopCategorySource[] = SEED_CATEGORIES.map(toSource);

/**
 * Shop tabs, Shop's Category filter and the `/category/:slug` Shop page match (ATS-249) read the
 * published categories from here: the server reads them once per request and hands them to the
 * browser through TransferState (`shop-categories`), so the server HTML and the first browser
 * render match; after that the browser follows `CatalogService.categories()` live.
 */
@Service()
export class ShopCategoriesService {
  readonly #firestore = injectFirestore();
  readonly #transfer = inject(TransferState);
  readonly #injector = inject(Injector);
  readonly #responseInit = inject(RESPONSE_INIT, { optional: true });
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #isServer = isPlatformServer(inject(PLATFORM_ID));

  readonly #seed = signal<readonly ShopCategorySource[] | null>(null);
  #loading: Promise<readonly ShopCategorySource[]> | null = null;

  constructor() {
    if (this.#transfer.hasKey(SHOP_CATEGORIES_KEY)) {
      this.#seed.set(this.#transfer.get(SHOP_CATEGORIES_KEY, []));
    }
  }

  /** Published categories: the live list once it has loaded, else the seed, else the built-ins. */
  readonly categories = computed((): readonly ShopCategorySource[] => {
    if (this.#isBrowser) {
      // Read lazily: on the server this service is created by a route guard, before the
      // resolver that seeds `settings/catalog` for CatalogService has run.
      const live = this.#injector.get(CatalogService).categories();
      if (live && live.length > 0) return live.map(toSource);
    }
    return this.#seed() ?? BUILT_IN;
  });

  /** Resolves once the list is known (one read at most); never rejects. */
  load(): Promise<readonly ShopCategorySource[]> {
    if (this.#seed() !== null) return Promise.resolve(this.categories());
    this.#loading ??= this.#read().then(() => this.categories());
    return this.#loading;
  }

  async #read(): Promise<void> {
    let list: readonly ShopCategorySource[] = BUILT_IN;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snap = await Promise.race([
        getDocs(
          query(
            collection(this.#firestore, CATEGORIES_COLLECTION),
            where('published', '==', true),
            orderBy('sortOrder', 'asc'),
            limit(100),
          ),
        ),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
        }),
      ]);
      if (snap) {
        const parsed = snap.docs.flatMap((doc) => {
          const result = v.safeParse(ShopCategorySourceSchema, { ...doc.data(), id: doc.id });
          return result.success ? [toSource(result.output)] : [];
        });
        if (parsed.length > 0) list = parsed;
      } else {
        this.#noStore();
      }
    } catch {
      this.#noStore();
    } finally {
      clearTimeout(timer);
    }
    this.#seed.set(list);
    // The browser uses the same list for its first render, so the server HTML matches.
    if (this.#isServer) this.#transfer.set(SHOP_CATEGORIES_KEY, list);
  }

  /** A server render built on the built-in list must not be kept by a cache. */
  #noStore(): void {
    if (!this.#isServer || !this.#responseInit) return;
    const headers = new Headers(this.#responseInit.headers);
    headers.set('Cache-Control', 'private, no-store');
    this.#responseInit.headers = headers;
  }
}

function toSource(category: {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly shopLabel?: string;
  readonly published?: boolean;
}): ShopCategorySource {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    ...(category.shopLabel ? { shopLabel: category.shopLabel } : {}),
    ...(category.published === false ? { published: false } : {}),
  };
}
