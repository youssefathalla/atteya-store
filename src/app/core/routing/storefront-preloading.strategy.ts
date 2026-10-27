import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import type { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';

/** Route data flag: `data: { preload: true }` marks a storefront chunk worth warming after idle. */
export const PRELOAD_ROUTE_FLAG = 'preload';

/**
 * Preloads only routes flagged `data.preload === true`, once the browser is idle,
 * and never on Save-Data or 2G. Admin, playground and login are never flagged.
 */
@Service()
export class StorefrontPreloadingStrategy implements PreloadingStrategy {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!this.#isBrowser || route.data?.[PRELOAD_ROUTE_FLAG] !== true || isConstrainedNetwork()) {
      return of(null);
    }
    return whenIdle().pipe(switchMap(() => load()));
  }
}

function whenIdle(): Observable<void> {
  return new Observable<void>((subscriber) => {
    const done = (): void => {
      subscriber.next();
      subscriber.complete();
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(done, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(done, 2000);
    return () => clearTimeout(id);
  });
}

/** True on Save-Data or 2G. Shared with the product prefetch in PR 2. */
export function isConstrainedNetwork(): boolean {
  if (typeof navigator === 'undefined') return true;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return Boolean(connection?.saveData) || /(^|-)2g$/.test(connection?.effectiveType ?? '');
}
