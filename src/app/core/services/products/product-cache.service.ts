import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { isConstrainedNetwork } from '@core/routing/storefront-preloading.strategy';
import type { Product } from './product.model';
import { ProductService } from './product.service';

const FRESH_MS = 60_000;
const MAX_ENTRIES = 50;
const MAX_SLUG_LENGTH = 200;

interface Entry {
  readonly at: number;
  readonly value: Promise<Product | null>;
}

/**
 * Browser-only, in-memory product cache keyed by slug. Shared by card prefetch,
 * the product page resolver, and lists that already hold full docs (siblings, later listings).
 * The server always reads Firestore directly. Nothing is written to disk.
 */
@Service()
export class ProductCacheService {
  readonly #products = inject(ProductService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #entries = new Map<string, Entry>();

  /** Cached if younger than 60 s, otherwise one Firestore read. In-flight reads are shared. */
  getBySlug(slug: string): Promise<Product | null> {
    if (!this.#isBrowser) return this.#products.getBySlug(slug);

    const hit = this.#entries.get(slug);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.value;

    const value = this.#read(slug);
    this.#put(slug, value, Date.now());
    return value;
  }

  /** Fire-and-forget warm-up on intent. No-op on the server, Save-Data or 2G. Never throws. */
  prefetch(slug: string): void {
    if (
      !this.#isBrowser ||
      isConstrainedNetwork() ||
      slug.length === 0 ||
      slug.length > MAX_SLUG_LENGTH
    ) {
      return;
    }
    void this.getBySlug(slug).catch(() => undefined);
  }

  /** Store full docs a page already loaded (published only), e.g. siblings. */
  seed(products: readonly Product[]): void {
    if (!this.#isBrowser) return;
    const at = Date.now();
    for (const product of products) {
      if (product.published !== true) continue;
      this.#put(product.slug, Promise.resolve(product), at);
    }
  }

  #read(slug: string): Promise<Product | null> {
    const entry: { value?: Promise<Product | null> } = {};
    const value = this.#products.getBySlug(slug).then(
      (product) => product,
      (error: unknown) => {
        if (this.#entries.get(slug)?.value === entry.value) this.#entries.delete(slug);
        throw error;
      },
    );
    entry.value = value;
    return value;
  }

  /** Map insertion order is eviction order. Re-insert so a refresh counts as newest. */
  #put(slug: string, value: Promise<Product | null>, at: number): void {
    this.#entries.delete(slug);
    this.#entries.set(slug, { at, value });
    if (this.#entries.size <= MAX_ENTRIES) return;
    const oldest = this.#entries.keys().next().value;
    if (oldest !== undefined) this.#entries.delete(oldest);
  }
}
