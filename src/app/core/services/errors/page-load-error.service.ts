import { inject, Service, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/**
 * A store page whose code couldn't be downloaded (ATS-268). `MainLayoutComponent` shows Something Went
 * Wrong in place of the page while `failedUrl` is set; the next finished navigation clears it.
 */
@Service()
export class PageLoadErrorService {
  readonly #failedUrl = signal<string | null>(null);

  /** The address that failed to open ('' when unknown: Try Again reloads the current page). */
  readonly failedUrl = this.#failedUrl.asReadonly();

  constructor() {
    inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.#failedUrl.set(null);
    });
  }

  report(url: string | null): void {
    // The router's report carries the address; a later one without it must not wipe it.
    if (url === null && this.#failedUrl() !== null) return;
    this.#failedUrl.set(url ?? '');
  }
}
