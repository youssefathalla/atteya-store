import { DOCUMENT } from '@angular/common';
import { afterNextRender, DestroyRef, inject, Service, signal } from '@angular/core';
import { Router } from '@angular/router';
import { injectFirestore } from '@core/firebase';
import { EGP_ENTRY, type CurrencyEntry } from '@core/services/offers/engine';
import {
  currencyFromTimeZone,
  normalizeCurrencyCode,
  readCachedCurrencyMap,
  readFreshCurrencyMap,
  readTimeZone,
  storeCachedCurrencyMap,
} from './currency-detect';
import type { PublicCurrencyMap } from './currency.schema';

const PENDING_TIMEOUT_MS = 2500;

/**
 * Storefront display currency. The server always stays on EGP.
 * The browser picks a currency from the timezone after hydration.
 * `?cur=` overrides that for one visit and is never saved.
 * Africa/Cairo stays on EGP and does not load the timezone map.
 */
@Service()
export class CurrencyService {
  readonly #document = inject(DOCUMENT);
  readonly #router = inject(Router);
  readonly #firestore = injectFirestore();
  readonly #destroyRef = inject(DestroyRef);

  readonly #selected = signal('EGP');
  readonly #entry = signal<CurrencyEntry>(EGP_ENTRY);
  readonly #ready = signal(false);

  readonly selected = this.#selected.asReadonly();
  readonly entry = this.#entry.asReadonly();
  readonly ready = this.#ready.asReadonly();

  #map: PublicCurrencyMap | null = null;
  #loading: Promise<PublicCurrencyMap | null> | null = null;
  #generation = 0;
  #settled = false;
  #timer: number | undefined;

  constructor() {
    afterNextRender(() => {
      void this.#boot();
    });
    this.#destroyRef.onDestroy(() => this.#clearTimer());
  }

  async #boot(): Promise<void> {
    const code = await this.#resolveInitialCode();
    this.#stripCurParam();
    if (code === 'EGP') {
      this.#apply(EGP_ENTRY);
      this.#settled = true;
      this.#clearPending();
      return;
    }
    this.#timer = window.setTimeout(() => this.#giveUp(), PENDING_TIMEOUT_MS);
    const generation = ++this.#generation;
    const map = await this.#loadMap();
    if (generation !== this.#generation || this.#settled) return;
    this.#clearTimer();
    if (!map) {
      this.#giveUp();
      return;
    }
    this.#map = map;
    this.#apply(entryFor(code, map));
    this.#settled = true;
    this.#clearPending();
  }

  async #resolveInitialCode(): Promise<string> {
    const fromQuery = normalizeCurrencyCode(this.#queryCur());
    if (fromQuery) return fromQuery;
    return currencyFromTimeZone(readTimeZone());
  }

  #queryCur(): string | null {
    let current: unknown = this.#router.routerState.snapshot.root;
    let value: unknown;
    while (isRouteNode(current)) {
      value = current.queryParams['cur'] ?? value;
      current = current.firstChild;
    }
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
  }

  #stripCurParam(): void {
    const url = this.#router.parseUrl(this.#router.url);
    if (!('cur' in url.queryParams)) return;
    delete url.queryParams['cur'];
    void this.#router.navigateByUrl(url, { replaceUrl: true });
  }

  async #loadMap(): Promise<PublicCurrencyMap | null> {
    const fresh = this.#map ?? readFreshCurrencyMap();
    if (fresh) {
      this.#map = fresh;
      return fresh;
    }
    try {
      this.#loading ??= import('./currency-loader').then((module) =>
        module.loadPublicCurrency(this.#firestore),
      );
      const loaded = await this.#loading;
      if (loaded && Object.keys(loaded).length > 0) {
        this.#map = loaded;
        storeCachedCurrencyMap(loaded);
        return loaded;
      }
    } catch {
      // A failed chunk or network read falls through to the last cached factors.
    } finally {
      this.#loading = null;
    }
    const stale = readCachedCurrencyMap(null);
    if (stale) this.#map = stale;
    return stale;
  }

  #apply(entry: CurrencyEntry): void {
    this.#selected.set(entry.code);
    this.#entry.set(entry);
    this.#ready.set(true);
  }

  #giveUp(): void {
    if (this.#settled) return;
    this.#generation += 1;
    this.#settled = true;
    console.warn('Currency rates took too long. Showing EGP prices.');
    this.#apply(EGP_ENTRY);
    this.#clearPending();
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #clearPending(): void {
    this.#document.documentElement.removeAttribute('data-cur-pending');
  }
}

function entryFor(code: string, map: PublicCurrencyMap): CurrencyEntry {
  const chosen = factorsEntry(code, map) ?? factorsEntry('USD', map);
  return chosen ?? EGP_ENTRY;
}

function factorsEntry(code: string, map: PublicCurrencyMap): CurrencyEntry | null {
  const factors = map[code];
  if (!factors) return null;
  return { code, factor: factors.factor };
}

interface RouteNode {
  readonly queryParams: Record<string, unknown>;
  readonly firstChild: unknown;
}

function isRouteNode(value: unknown): value is RouteNode {
  return typeof value === 'object' && value !== null && 'queryParams' in value;
}
