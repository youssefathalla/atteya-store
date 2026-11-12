import { inject, Service, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationSkipped, NavigationStart, Router } from '@angular/router';

/**
 * A store page whose code couldn't be downloaded (ATS-268). `MainLayoutComponent` shows Something Went
 * Wrong in place of the page while `failedUrl` is set; the next navigation clears it.
 */
@Service()
export class PageLoadErrorService {
  readonly #failedUrl = signal<string | null>(null);

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
    // The router's report carries the address; a later one without it must not wipe it.
    if (url === null && this.#failedUrl() !== null) return;
    this.#failedUrl.set(url ?? '');
  }
}
