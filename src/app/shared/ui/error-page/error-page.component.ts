import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { SharedIconModule } from '@shared/ui/mat-icon';

/** `not-found`: Page Not Found (404). `failed`: Something Went Wrong (data or page download failed). */
export type ErrorPageKind = 'not-found' | 'failed';

/**
 * The middle of the store's Page Not Found and Something Went Wrong pages (ATS-268). It renders inside
 * `MainLayoutComponent` like every store page, so it adds no header, menu or footer of its own.
 * The status code, `noindex` and cache headers belong to the page that shows it, and so does the side
 * padding (`.container-content`).
 */
@Component({
  selector: 'app-error-page',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, SharedIconModule],
  templateUrl: './error-page.component.html',
})
export class ErrorPageComponent {
  readonly kind = input<ErrorPageKind>('not-found');
  /**
   * Where Try Again goes: the address of a page whose download failed (the address bar still shows the
   * previous page). Null reloads the current page.
   */
  readonly retryUrl = input<string | null>(null);
  /** 2 when the page around it already has its own `h1` (Shop, search, category results). */
  readonly level = input<1 | 2>(1);

  readonly #router = inject(Router);
  readonly #document = inject(DOCUMENT);

  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);

  readonly kicker = computed(() => (this.kind() === 'not-found' ? 'ERROR 404' : null));
  readonly heading = computed(() =>
    this.kind() === 'not-found' ? 'PAGE NOT FOUND' : 'SOMETHING WENT WRONG',
  );

  /** The search box works before the page wakes up too: it is a plain GET form to /search. */
  search(event: SubmitEvent, field: HTMLInputElement): void {
    event.preventDefault();
    const q = field.value.trim();
    void this.#router.navigate(['/search'], q ? { queryParams: { q } } : {});
  }

  tryAgain(): void {
    const location = this.#document.defaultView?.location;
    if (!location) return;
    const url = this.retryUrl();
    if (url) location.assign(url);
    else location.reload();
  }
}
