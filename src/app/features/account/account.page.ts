import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  Injector,
  OnInit,
  PLATFORM_ID,
  resource,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { of } from 'rxjs';
import { AuthService } from '@core/services/auth/auth.service';
import { FavoritesService } from '@core/services/favorites';
import { ShopperOrdersService } from '@core/services/orders/shopper-orders.service';
import { SeoService } from '@core/services/seo';
import { accountDisplayName, accountInitial, UserProfileService } from '@core/services/user-profile';
import { ConfirmEmailPromptComponent } from '@shared/ui/confirm-email-prompt';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { AddressSectionComponent } from './components/address-section/address-section.component';
import { EmailsSectionComponent } from './components/emails-section/emails-section.component';
import { OrdersSectionComponent } from './components/orders-section/orders-section.component';
import { ProfileSectionComponent } from './components/profile-section/profile-section.component';

/**
 * `/account` (client-rendered, behind `accountAuthGuard`): a black welcome bar (name, email,
 * order and favorite counts, Sign Out) over a grid: Orders, Delivery Address, then Profile,
 * Favorites and Emails (three columns on wide screens, two on tablets, one on phones). `users/{uid}` is read live
 * and handed to each section.
 */
@Component({
  selector: 'app-account-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    SharedIconModule,
    SkeletonComponent,
    ConfirmEmailPromptComponent,
    ProfileSectionComponent,
    AddressSectionComponent,
    EmailsSectionComponent,
    OrdersSectionComponent,
  ],
  templateUrl: './account.page.html',
})
export class AccountPageComponent implements OnInit {
  readonly #auth = inject(AuthService);
  readonly #profiles = inject(UserProfileService);
  readonly #seo = inject(SeoService);
  readonly #orders = inject(ShopperOrdersService);
  readonly #favorites = inject(FavoritesService);
  readonly #injector = inject(Injector);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  #scrolledToSection = false;

  readonly uid = computed(() => this.#auth.user()?.uid ?? '');
  readonly email = computed(() => this.#auth.user()?.email ?? '');

  readonly profileResource = rxResource({
    params: () => this.uid() || undefined,
    stream: ({ params: uid }) => (uid ? this.#profiles.watch(uid) : of(null)),
  });

  readonly profile = computed(() => (this.profileResource.hasValue() ? this.profileResource.value() : null));
  readonly profileLoading = computed(
    () => this.profileResource.isLoading() && !this.profileResource.hasValue(),
  );

  readonly name = computed(() =>
    accountDisplayName(this.profile()?.name, this.#auth.user()?.displayName, this.email()),
  );
  readonly initial = computed(() => accountInitial(this.name()));

  /** One count read for the welcome bar; a failure just leaves a dash. */
  readonly orderCountResource = resource({
    params: () => this.uid() || undefined,
    loader: ({ params: uid }) => this.#orders.count(uid),
  });
  readonly orderCount = computed(() =>
    this.orderCountResource.hasValue() ? this.orderCountResource.value() : null,
  );

  readonly favoritesReady = this.#favorites.ready;
  readonly favoritesCount = this.#favorites.count;

  constructor() {
    // The router scrolls to `#orders` / `#profile` at once, while the sections still show
    // placeholders. Once the details load the page grows, so scroll to that section again.
    effect(() => {
      if (!this.profileResource.hasValue() || this.#scrolledToSection || !this.#isBrowser) return;
      this.#scrolledToSection = true;
      afterNextRender(() => scrollToHashSection(), { injector: this.#injector });
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Your Account | Atteya Store',
      description: 'Your details, delivery address, emails and orders.',
      noindex: true,
    });
  }

  signOut(): void {
    void this.#auth.logout();
  }
}

function scrollToHashSection(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}
