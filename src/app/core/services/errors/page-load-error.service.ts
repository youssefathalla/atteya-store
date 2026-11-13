import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationSkipped, NavigationStart, Router } from '@angular/router';
import { MISSING_CODE_RELOAD_KEY, shouldReloadForMissingCode } from './page-load-error';

/**
 * A page whose code couldn't be downloaded while it was opening (ATS-268).
 *
 * First the site reloads once at that address: a tab opened before a release asks for code files the
 * new release no longer has, and a reload picks up the new ones, so the person lands on the page they
 * clicked (store and admin alike). Offline, when storage is blocked, or when that already happened in
 * the last 30 seconds, `failedUrl` is set instead and `MainLayoutComponent` shows Something Went
 * Wrong in place of the page; the next navigation clears it.
 */
@Service()
export class PageLoadErrorService {
  readonly #document = inject(DOCUMENT);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #failedUrl = signal<string | null>(null);
  /** A reload has started: the router's and the error handler's reports of the same failure stop here. */
  #reloading = false;

  /** The address that failed to open ('' when unknown: Try Again reloads the current page). */
  readonly failedUrl = this.#failedUrl.asReadonly();

  constructor() {
    inject(Router).events.subscribe((event) => {
      // A new, finished, cancelled or skipped navigation leaves the error behind; a failed download
      // reports after its own NavigationStart, so it stays.
      if (
        event instanceof NavigationStart ||
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationSkipped
      ) {
        this.#failedUrl.set(null);
      }
    });
  }

  report(url: string | null): void {
    if (this.#reloading) return;
    if (url !== null && this.#reloadOnce(url)) return;
    // The router's report carries the address; a later one without it must not wipe it.
    if (url === null && this.#failedUrl() !== null) return;
    this.#failedUrl.set(url ?? '');
  }

  /** Opens `url` with a full page load, at most once per 30 seconds; false when it didn't. */
  #reloadOnce(url: string): boolean {
    const view = this.#document.defaultView;
    if (!this.#isBrowser || !view) return false;
    try {
      const storage = view.sessionStorage;
      const now = Date.now();
      if (!shouldReloadForMissingCode(storage.getItem(MISSING_CODE_RELOAD_KEY), view.navigator.onLine, now)) {
        return false;
      }
      // Saved before leaving, so the next page knows not to reload again if the file is really gone.
      storage.setItem(MISSING_CODE_RELOAD_KEY, String(now));
    } catch {
      // Without storage there is no guard against a reload loop: show Something Went Wrong instead.
      return false;
    }
    this.#reloading = true;
    view.location.assign(url || view.location.href);
    return true;
  }
}
