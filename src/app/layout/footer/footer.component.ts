import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { AuthService } from '@core/services/auth/auth.service';
import { safeReturnUrl } from '@core/services/auth/auth.utils';
import { NavService } from '@core/services/navigation';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import { FooterSignupComponent } from './components/footer-signup/footer-signup.component';
import { footerLabel, footerSocialLinks } from './utils/footer-links';

/** Shop column links written in the template, so a nav entry with the same path is skipped. */
const FIXED_SHOP_PATHS = new Set(['/shop', '/brands', '/category/all']);

/**
 * Storefront footer: Shop / Help / Account link columns, the email sign-up for visitors who
 * aren't signed in, and the bottom row (copyright, Terms, Privacy, social icons).
 * `MainLayoutComponent` leaves it out on focus pages (Sign in, Checkout).
 */
@Component({
  selector: 'app-footer',
  host: { class: 'block w-full mt-auto' },
  imports: [RouterLink, LinkTargetPipe, FooterSignupComponent],
  templateUrl: './footer.component.html',
})
export class FooterComponent {
  readonly #auth = inject(AuthService);
  readonly #nav = inject(NavService);
  readonly #router = inject(Router);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly storeName = STORE_INFO.name;
  readonly year = new Date().getFullYear();
  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);
  readonly socialLinks = footerSocialLinks();

  /**
   * Main categories from the navigation settings (same list and visibility as the top nav),
   * minus any entry with no link or pointing at Shop All or Brands, which the column always lists.
   */
  readonly categoryLinks = computed(() =>
    this.#nav
      .storefrontCategories()
      .flatMap(({ label, path }) =>
        path && !FIXED_SHOP_PATHS.has(path) ? [{ label: footerLabel(label), path }] : [],
      ),
  );

  /**
   * The server and the first browser render show neither Sign In nor Sign Out (auth is only
   * known in the browser), so hydration matches; the account links appear once auth is ready.
   */
  readonly accountState = computed(() => {
    if (!this.#isBrowser || !this.#auth.isAuthReady()) return 'pending' as const;
    return this.#auth.isAuthenticated() ? ('signed-in' as const) : ('signed-out' as const);
  });
  readonly isAdmin = this.#auth.isAdmin;

  /**
   * Where Sign In / Create Account bring the visitor back to. A signal, because the footer
   * stays mounted across navigations and would otherwise keep the first page's URL (zoneless).
   */
  readonly returnUrl = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => safeReturnUrl(this.#router.url)),
    ),
    { initialValue: safeReturnUrl(this.#router.url) },
  );

  signOut(): void {
    void this.#auth.logout();
  }
}
