import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  DestroyRef,
  inject,
  PLATFORM_ID,
  REQUEST,
  Service,
  signal,
  TransferState,
} from '@angular/core';
import { Router } from '@angular/router';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { environment } from '@env/environment';
import { EGP_ENTRY, type CurrencyEntry } from '@core/services/offers/engine';
import {
  currencyFromCountry,
  normalizeCurrencyCode,
  readCachedCurrencyMap,
  readFreshCurrencyMap,
  storeCachedCurrencyMap,
} from './currency-detect';
import { loadPublicCurrency } from './currency-loader';
import type { PublicCurrencyMap } from './currency.schema';
import { CURRENCY_BOOT_KEY, type CurrencyBootTransfer } from './currency.state';
import {
  applyDevLocalGeoFallback,
  countryFromServerVisitorHeader,
  resolveVisitorCountry,
} from './visitor-geo';
import { VisitorLocationResponseSchema } from './visitor-geo.schema';

const PENDING_TIMEOUT_MS = 2500;
const VISITOR_LOCATION_PATH = '/api/visitor-location';

/**
 * Storefront display currency from visitor geo (CDN headers or IP lookup).
 * Egypt stays on EGP and keeps the domestic shipping banner.
 * `?cur=` overrides for one visit and is never saved.
 */
@Service()
export class CurrencyService {
  readonly #platformId = inject(PLATFORM_ID);
  readonly #document = inject(DOCUMENT);
  readonly #router = inject(Router);
  readonly #firestore = injectFirestore();
  readonly #destroyRef = inject(DestroyRef);
  readonly #transfer = inject(TransferState);
  readonly #request = inject(REQUEST, { optional: true });

  readonly #selected = signal('EGP');
  readonly #entry = signal<CurrencyEntry>(EGP_ENTRY);
  readonly #ready = signal(false);
  readonly #visitorCountry = signal<string | null>(null);

  readonly selected = this.#selected.asReadonly();
  readonly entry = this.#entry.asReadonly();
  readonly ready = this.#ready.asReadonly();
  /** ISO country from CDN/IP geo (AS-21). Null until resolved or when unknown. */
  readonly visitorCountry = this.#visitorCountry.asReadonly();

  #map: PublicCurrencyMap | null = null;
  #loading: Promise<PublicCurrencyMap | null> | null = null;
  #generation = 0;
  #settled = false;
  #timer: number | undefined;

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      this.#hydrateFromTransfer();
    }
    afterNextRender(() => {
      void this.#bootClient();
    });
    this.#destroyRef.onDestroy(() => this.#clearTimer());
  }

  /** Runs during SSR before the storefront HTML is rendered. */
  async prepareForServerRender(): Promise<void> {
    this.#resetForRequest();
    const fromQuery = normalizeCurrencyCode(this.#queryCur());
    if (fromQuery) {
      await this.#finishWithCode(fromQuery, null, { pendingIntl: fromQuery !== 'EGP' });
      this.#publishTransfer(fromQuery);
      return;
    }
    const headers = this.#request?.headers ?? null;
    const preset = headers ? countryFromServerVisitorHeader(headers) : null;
    const resolved = preset ?? (headers ? await resolveVisitorCountry(headers) : null);
    const country = applyDevLocalGeoFallback(resolved, !environment.production);
    this.#visitorCountry.set(country);
    const code = currencyFromCountry(country);
    await this.#finishWithCode(code, country, { pendingIntl: code !== 'EGP' });
    this.#publishTransfer(code);
  }

  /** Each SSR request gets a fresh currency resolution (Cloud Run reuses the process). */
  #resetForRequest(): void {
    this.#generation += 1;
    this.#settled = false;
    this.#ready.set(false);
    this.#clearTimer();
  }

  async #bootClient(): Promise<void> {
    if (this.#settled) {
      await this.#correctStaleIntlFromHydration();
      if (this.#settled) {
        this.#transfer.remove(CURRENCY_BOOT_KEY);
        const fromQuery = normalizeCurrencyCode(this.#queryCur());
        this.#stripCurParam();
        if (fromQuery && fromQuery !== this.#selected()) {
          this.#settled = false;
          await this.#finishWithCode(fromQuery, this.#visitorCountry(), {
            pendingIntl: fromQuery !== 'EGP',
          });
        }
        return;
      }
    }

    const transferred = this.#transfer.get(CURRENCY_BOOT_KEY, null);
    if (transferred) {
      this.#transfer.remove(CURRENCY_BOOT_KEY);
      this.#visitorCountry.set(transferred.country);
      if (transferred.map) this.#map = transferred.map;
      const fromQuery = normalizeCurrencyCode(this.#queryCur());
      this.#stripCurParam();
      if (fromQuery) {
        await this.#finishWithCode(fromQuery, this.#visitorCountry(), {
          pendingIntl: fromQuery !== 'EGP',
        });
        return;
      }
      if (transferred.code === 'EGP') {
        this.#apply(EGP_ENTRY);
        this.#settled = true;
        this.#syncDocumentHints(this.#visitorCountry(), true, false);
        return;
      }
      if (this.#map) {
        this.#apply(entryFor(transferred.code, this.#map));
        this.#settled = true;
        this.#syncDocumentHints(this.#visitorCountry(), true, false);
        return;
      }
    }

    const code = await this.#resolveInitialCode();
    this.#stripCurParam();
    await this.#finishWithCode(code, this.#visitorCountry(), { pendingIntl: code !== 'EGP' });
  }

  #hydrateFromTransfer(): void {
    const transferred = this.#transfer.get(CURRENCY_BOOT_KEY, null);
    if (!transferred) return;
    this.#visitorCountry.set(transferred.country);
    if (transferred.map) this.#map = transferred.map;
    if (transferred.code === 'EGP') {
      this.#apply(EGP_ENTRY);
      this.#settled = true;
      this.#syncDocumentHints(this.#visitorCountry(), true, false);
      return;
    }
    if (this.#map) {
      this.#apply(entryFor(transferred.code, this.#map));
      this.#settled = true;
      this.#syncDocumentHints(this.#visitorCountry(), true, false);
    }
  }

  #publishTransfer(code: string): void {
    const payload: CurrencyBootTransfer = {
      country: this.#visitorCountry(),
      code: this.#selected(),
      map: code === 'EGP' ? null : this.#map,
    };
    this.#transfer.set(CURRENCY_BOOT_KEY, payload);
  }

  async #finishWithCode(
    code: string,
    country: string | null,
    options: { pendingIntl: boolean },
  ): Promise<void> {
    if (country !== null) this.#visitorCountry.set(country);
    if (code === 'EGP') {
      this.#apply(EGP_ENTRY);
      this.#settled = true;
      this.#syncDocumentHints(this.#visitorCountry(), true, false);
      return;
    }
    if (options.pendingIntl) {
      this.#syncDocumentHints(this.#visitorCountry(), false, true);
    }
    if (isPlatformBrowser(this.#platformId)) {
      this.#timer = window.setTimeout(() => this.#giveUp(), PENDING_TIMEOUT_MS);
    }
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
    this.#syncDocumentHints(this.#visitorCountry(), true, false);
  }

  /** SSR missed geo (App Hosting has no CDN country headers); re-read like CSR routes. */
  async #correctStaleIntlFromHydration(): Promise<void> {
    if (this.#visitorCountry() !== null || this.#selected() === 'EGP') return;
    const country = await this.#resolveVisitorCountryClient();
    if (!country) return;
    const code = currencyFromCountry(country);
    if (code === this.#selected()) {
      this.#visitorCountry.set(country);
      this.#syncDocumentHints(country, this.#ready(), false);
      return;
    }
    this.#settled = false;
    await this.#finishWithCode(code, country, { pendingIntl: code !== 'EGP' });
  }

  async #resolveInitialCode(): Promise<string> {
    const fromQuery = normalizeCurrencyCode(this.#queryCur());
    if (fromQuery) return fromQuery;
    const country = await this.#resolveVisitorCountryClient();
    this.#visitorCountry.set(country);
    return currencyFromCountry(country);
  }

  async #resolveVisitorCountryClient(): Promise<string | null> {
    try {
      const response = await fetch(VISITOR_LOCATION_PATH, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      const parsed = v.safeParse(VisitorLocationResponseSchema, await response.json());
      if (!parsed.success) return null;
      return applyDevLocalGeoFallback(parsed.output.country, !environment.production);
    } catch {
      return null;
    }
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
    const fresh = this.#map ?? (isPlatformBrowser(this.#platformId) ? readFreshCurrencyMap() : null);
    if (fresh) {
      this.#map = fresh;
      return fresh;
    }
    try {
      this.#loading ??= loadPublicCurrency(this.#firestore);
      const loaded = await this.#loading;
      if (loaded && Object.keys(loaded).length > 0) {
        this.#map = loaded;
        if (isPlatformBrowser(this.#platformId)) {
          storeCachedCurrencyMap(loaded);
        }
        return loaded;
      }
    } catch {
      // A failed chunk or network read falls through to the last cached factors.
    } finally {
      this.#loading = null;
    }
    if (isPlatformBrowser(this.#platformId)) {
      const stale = readCachedCurrencyMap(null);
      if (stale) this.#map = stale;
      return stale;
    }
    return null;
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
    this.#syncDocumentHints(this.#visitorCountry(), true, false);
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #syncDocumentHints(country: string | null, ready: boolean, pendingIntl: boolean): void {
    const root = this.#document.documentElement;
    if (country) root.setAttribute('data-visitor-country', country);
    else root.removeAttribute('data-visitor-country');
    if (ready) root.setAttribute('data-currency-ready', '');
    else root.removeAttribute('data-currency-ready');
    if (pendingIntl) root.setAttribute('data-cur-pending', '');
    else root.removeAttribute('data-cur-pending');
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
