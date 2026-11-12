/// <reference types="@types/google.maps" />
import { Service, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '@env/environment';

@Service()
export class GoogleMapsLoaderService {
  readonly #platformId = inject(PLATFORM_ID);
  readonly #isLoaded = signal(false);
  readonly isLoaded = this.#isLoaded.asReadonly();

  #loadingPromise: Promise<void> | null = null;

  /**
   * Loads the Google Maps JavaScript API dynamically using the bootstrap loader.
   * This approach supports `google.maps.importLibrary()` for AdvancedMarker.
   */
  load(): Promise<void> {
    if (!isPlatformBrowser(this.#platformId)) {
      return Promise.resolve();
    }
    if (this.#isLoaded()) return Promise.resolve();
    if (this.#loadingPromise) return this.#loadingPromise;

    this.#loadingPromise = new Promise((resolve, reject) => {
      // Check if already loaded
      if ('google' in globalThis && (globalThis as unknown as { google: { maps: unknown } }).google.maps) {
        this.#isLoaded.set(true);
        resolve();
        return;
      }

      // Create global callback BEFORE appending the script
      (globalThis as unknown as Record<string, () => void>)['__googleMapsCallback'] = () => {
        this.#isLoaded.set(true);
        resolve();
      };

      // Use the classic script loader
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}&libraries=places,geometry,routes&loading=async&callback=__googleMapsCallback`;
      script.async = true;
      script.defer = true;

      script.onerror = () => {
        // Let the next call try again instead of returning this failed promise forever.
        this.#loadingPromise = null;
        script.remove();
        reject(new Error('Failed to load Google Maps SDK'));
      };

      document.head.appendChild(script);
    });

    return this.#loadingPromise;
  }
}
