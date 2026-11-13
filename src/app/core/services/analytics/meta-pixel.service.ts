import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID, Service } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '@env/environment';

/** Meta standard events the store sends (ATS-290). */
export type MetaPixelEvent =
  'PageView' | 'ViewContent' | 'Search' | 'AddToCart' | 'InitiateCheckout' | 'AddPaymentInfo' | 'Purchase';

/** One bag line or product in Meta's `contents` shape. */
export interface MetaPixelContent {
  id: string;
  quantity: number;
  item_price?: number;
}

/** Parameters Meta reads on standard events. Only send what is known. */
export interface MetaPixelParams {
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  content_type?: 'product' | 'product_group';
  contents?: MetaPixelContent[];
  currency?: string;
  value?: number;
  num_items?: number;
  search_string?: string;
  payment_type?: string;
}

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};

type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

const SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
/** Set `localStorage.metaPixelDebug = '1'` to print every event in the console (dev QA). */
const DEBUG_KEY = 'metaPixelDebug';
/** Purchase ids already sent from this browser, so a reload of the order page doesn't count twice. */
const SENT_PURCHASES_KEY = 'metaPixelPurchases';

/** True when a URL (or its `?query` / `#hash` part) carries a guest order's view key (`key=`). */
function hasViewKey(url: string): boolean {
  // Also inside another link in the URL, e.g. `/login?returnUrl=%2Fcheckout%2Fconfirmation%2F…%3Fkey%3D…`.
  let text = url;
  for (let round = 0; round < 3; round++) {
    if (/[?&]key=/.test(text)) return true;
    let decoded: string;
    try {
      decoded = decodeURIComponent(text);
    } catch {
      return false;
    }
    if (decoded === text) return false;
    text = decoded;
  }
  return /[?&]key=/.test(text);
}

/**
 * Meta's product fields from bag or order lines: ids, quantities (and unit prices in EGP when known).
 * Lines of the same product are merged.
 */
export function metaPixelContents(
  lines: readonly { productId: string; quantity: number; unitEgp?: number | null }[],
): Pick<MetaPixelParams, 'content_ids' | 'contents' | 'content_type' | 'num_items'> {
  const byId = new Map<string, MetaPixelContent>();
  for (const line of lines) {
    const current = byId.get(line.productId);
    if (current) {
      current.quantity += line.quantity;
    } else {
      byId.set(line.productId, {
        id: line.productId,
        quantity: line.quantity,
        ...(line.unitEgp != null ? { item_price: line.unitEgp } : {}),
      });
    }
  }
  const contents = [...byId.values()];
  return {
    content_ids: contents.map((c) => c.id),
    contents,
    content_type: 'product',
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * Meta (Facebook) Pixel for the client's ads (ATS-290).
 *
 * - Runs in the browser only, and only when `environment.metaPixelId` is set (the live store).
 *   The dev site has no id, so dev clicks never reach the client's ad data.
 * - The Meta script loads on the first store page (never on `/admin`) and never blocks the page.
 * - PageView is sent on every finished navigation (the store is a single-page app).
 * - Every event gets an `eventID`, ready for Conversions API de-duplication later.
 */
@Service()
export class MetaPixelService {
  readonly #document = inject(DOCUMENT);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #pixelId = environment.metaPixelId ?? '';

  #started = false;

  /** Load the Pixel and start sending page views. Safe to call more than once. */
  start(): void {
    if (!this.#isBrowser || this.#started) return;
    this.#started = true;

    // One PageView per page: query-only changes (Shop filters, a cleaned-up link) are the same page,
    // and staff pages are not the store.
    let lastPath: string | null = null;
    const subscription = this.#router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        // A guest order's view key (`?key=`) opens the order: never let Meta read it from the page
        // URL. The order page takes it out with a `replaceUrl` navigation, and that one sends the
        // PageView (the path is not recorded here, so it still counts as a new page).
        if (hasViewKey(event.urlAfterRedirects)) return;
        const path = event.urlAfterRedirects.split(/[?#]/)[0] ?? '';
        if (path === lastPath) return;
        lastPath = path;
        if (path === '/admin' || path.startsWith('/admin/')) return;
        // Meta's script loads on the first store page, never on staff pages.
        if (this.#pixelId) this.#load();
        this.track('PageView');
      });
    this.#destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  /** AddToCart for bag lines just added. `value` is the EGP total when the page knows it. */
  trackAddToCart(lines: readonly { productId: string; quantity: number }[], value?: number | null): void {
    if (lines.length === 0) return;
    this.track('AddToCart', {
      ...metaPixelContents(lines),
      currency: 'EGP',
      ...(value != null && value > 0 ? { value } : {}),
    });
  }

  /**
   * Send one standard event. Does nothing on the server, when no Pixel id is set, or while the
   * address bar holds a guest order's view key. Returns true when the event went to Meta.
   */
  track(event: MetaPixelEvent, params?: MetaPixelParams, eventId?: string): boolean {
    if (!this.#isBrowser) return false;
    const id = eventId ?? this.#newEventId(event);

    if (this.#debug()) console.info(`[Meta Pixel] ${event}`, params ?? {}, id);

    const fbq = this.#window()?.fbq;
    if (!this.#pixelId || !fbq) return false;
    // Meta tags every event with the page URL: skip it while a guest order's view key is there.
    if (this.#locationHasViewKey()) return false;
    if (params) fbq('track', event, params, { eventID: id });
    else fbq('track', event, {}, { eventID: id });
    return true;
  }

  /**
   * Purchase from an order's price snapshot: EGP total, paid lines only (free gifts are left out).
   * Sent once per order in this browser.
   */
  trackOrderPurchase(
    orderId: string,
    pricing: {
      readonly lines: readonly { productId: string; quantity: number; unitEgp: number; gift?: unknown }[];
      readonly subtotalEgp: number;
      readonly totalEgp?: number;
    },
  ): void {
    const paid = pricing.lines.filter((line) => !line.gift);
    this.trackPurchase(orderId, {
      ...metaPixelContents(paid),
      currency: 'EGP',
      value: pricing.totalEgp ?? pricing.subtotalEgp,
    });
  }

  /**
   * Send Purchase once per order in this browser. The event id is the order id, so the same
   * order can later be matched with a server event.
   */
  trackPurchase(orderId: string, params: MetaPixelParams): void {
    if (!this.#isBrowser || !orderId) return;
    const sent = this.#readSentPurchases();
    if (sent.includes(orderId)) return;
    // Not sent (no Pixel, or a view key still in the URL): leave it unmarked so a later call sends it.
    if (!this.track('Purchase', params, `purchase-${orderId}`)) return;
    this.#writeSentPurchases([...sent, orderId].slice(-20));
  }

  #load(): void {
    const win = this.#window();
    if (!win || win.fbq) return;

    // Meta's standard loader, written out so it can be typed and kept out of index.html.
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    // Meta's script would otherwise send its own PageView on every `history.pushState` /
    // `replaceState`: admin pages, query-only changes, and every page twice. The router handler
    // in `start()` sends the only PageViews.
    fbq.disablePushState = true;
    win.fbq = fbq;
    win._fbq ??= fbq;

    const script = this.#document.createElement('script');
    script.async = true;
    script.src = SCRIPT_URL;
    this.#document.head.appendChild(script);

    // No automatic button-click or page-data events: Meta only gets the events this service sends.
    fbq('set', 'autoConfig', false, this.#pixelId);
    fbq('init', this.#pixelId);
  }

  #window(): PixelWindow | null {
    return (this.#document.defaultView as PixelWindow | null) ?? null;
  }

  #locationHasViewKey(): boolean {
    const location = this.#window()?.location;
    return !!location && hasViewKey(`${location.search}${location.hash}`);
  }

  #newEventId(event: MetaPixelEvent): string {
    const random =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${event.toLowerCase()}-${random}`;
  }

  #debug(): boolean {
    try {
      return this.#window()?.localStorage.getItem(DEBUG_KEY) === '1';
    } catch {
      return false;
    }
  }

  #readSentPurchases(): string[] {
    try {
      const raw = this.#window()?.localStorage.getItem(SENT_PURCHASES_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  #writeSentPurchases(ids: string[]): void {
    try {
      this.#window()?.localStorage.setItem(SENT_PURCHASES_KEY, JSON.stringify(ids));
    } catch {
      // Storage blocked (private mode): the order page may send Purchase again on reload.
    }
  }
}
