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
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { of } from 'rxjs';
import { AuthService } from '@core/services/auth/auth.service';
import { SeoService } from '@core/services/seo';
import { accountDisplayName, accountInitial, UserProfileService } from '@core/services/user-profile';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AddressSectionComponent } from './components/address-section/address-section.component';
import { EmailsSectionComponent } from './components/emails-section/emails-section.component';
import { OrdersSectionComponent } from './components/orders-section/orders-section.component';
import { ProfileSectionComponent } from './components/profile-section/profile-section.component';

/**
 * `/account` (client-rendered, behind `accountAuthGuard`): Profile, Delivery Address, Emails
 * and Orders for the signed-in shopper. `users/{uid}` is read live and handed to each section.
 */
@Component({
  selector: 'app-account-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    SharedIconModule,
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

  readonly sections = [
    { id: 'profile', label: 'Profile' },
    { id: 'address', label: 'Delivery Address' },
    { id: 'emails', label: 'Emails' },
    { id: 'orders', label: 'Orders' },
  ] as const;

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
