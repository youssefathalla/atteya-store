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
import { CatalogService } from '@core/services/products/catalog.service';
import { BRANDS_COLLECTION } from '@core/services/products/product.constants';
import { ShareImageSchema, toShareImage, type ShareImage } from '@core/services/products/utils/share-image';
import { timeToMs, type NavAutoBrand } from './nav-auto-columns';

/** Published brands for auto navigation columns, sent from the server render to the browser. */
export const NAV_AUTO_BRANDS_KEY = makeStateKey<readonly NavAutoBrand[]>('nav-auto-brands');

/** A slow read must not hold the page; the brand columns are then left empty. */
const READ_TIMEOUT_MS = 3000;

const BrandSourceSchema = v.object({
  id: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  slug: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  sortOrder: v.optional(v.pipe(v.number(), v.integer()), 0),
  createdAt: v.optional(v.unknown()),
  // A broken logo must not drop the brand: it just has no share picture.
  logo: v.fallback(v.optional(v.nullable(ShareImageSchema)), null),
});

/**
 * The published brands that "All Brands" and "Newest Brands" navigation columns list (ATS-247).
 * The server reads them once per request, only when the saved navigation has such a column
 * (`navigationSettingsResolver`), and hands them to the browser through TransferState
 * (`nav-auto-brands`), so the server HTML and the first browser render match; after that the
 * browser follows `CatalogService.brands()` live.
 */
@Service()
export class NavAutoBrandsService {
  readonly #firestore = injectFirestore();
  readonly #transfer = inject(TransferState);
  readonly #injector = inject(Injector);
  readonly #responseInit = inject(RESPONSE_INIT, { optional: true });
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #isServer = isPlatformServer(inject(PLATFORM_ID));

  readonly #seed = signal<readonly NavAutoBrand[] | null>(null);
  #loading: Promise<void> | null = null;

  constructor() {
    if (this.#transfer.hasKey(NAV_AUTO_BRANDS_KEY)) {
      this.#seed.set(this.#transfer.get(NAV_AUTO_BRANDS_KEY, []));
      if (this.#isBrowser) this.#transfer.remove(NAV_AUTO_BRANDS_KEY);
    }
  }

  /** Published brands: the live list once it has loaded, else the server's list, else none. */
  readonly brands = computed((): readonly NavAutoBrand[] => {
    if (this.#isBrowser) {
      const live = this.#injector.get(CatalogService).brands();
      if (live) return live.map(toNavAutoBrand);
    }
    return this.#seed() ?? [];
  });

  /**
   * True once the brands are known: the server's list, or the live list in the browser. A page
   * rendered only in the browser waits for it before showing a brand column (no pop-in).
   */
  readonly ready = computed(
    () =>
      this.#seed() !== null || (this.#isBrowser && this.#injector.get(CatalogService).brands() !== undefined),
  );

  /** Server only: reads the published brands once for this request; never rejects. */
  load(): Promise<void> {
    if (!this.#isServer || this.#seed() !== null) return Promise.resolve();
    this.#loading ??= this.#read();
    return this.#loading;
  }

  async #read(): Promise<void> {
    let list: readonly NavAutoBrand[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snap = await Promise.race([
        getDocs(
          query(
            collection(this.#firestore, BRANDS_COLLECTION),
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
        list = snap.docs.flatMap((doc) => {
          const result = v.safeParse(BrandSourceSchema, { ...doc.data(), id: doc.id });
          return result.success ? [toNavAutoBrand(result.output)] : [];
        });
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
    this.#transfer.set(NAV_AUTO_BRANDS_KEY, list);
  }

  /** A server render without the brands must not be kept by a cache. */
  #noStore(): void {
    if (!this.#responseInit) return;
    const headers = new Headers(this.#responseInit.headers);
    headers.set('Cache-Control', 'private, no-store');
    this.#responseInit.headers = headers;
  }
}

/** A brand doc as an auto column needs it (also the admin preview's mapping). */
export function toNavAutoBrand(brand: {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly createdAt?: unknown;
  readonly logo?: ShareImage | null;
}): NavAutoBrand {
  const logo = toShareImage(brand.logo);
  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    sortOrder: brand.sortOrder,
    createdAtMs: timeToMs(brand.createdAt),
    ...(logo ? { logo } : {}),
  };
}
