import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { of } from 'rxjs';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { AuthService } from '@core/services/auth/auth.service';
import { FavoritesService } from '@core/services/favorites';
import { ShopperOrdersService } from '@core/services/orders/shopper-orders.service';
import {
  accountDisplayName,
  accountInitial,
  isProfileIncomplete,
  UserProfileService,
} from '@core/services/user-profile';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

/**
 * Signed-in shopper's account panel, opened by `AccountPanelService` from the account icon:
 * who is signed in, "Complete Your Profile" while name or phone is missing, links to the
 * `/account` sections and Favorites, the latest order, saved favorites, WhatsApp help and
 * Sign Out. Profile and latest order are read live.
 */
@Component({
  selector: 'app-account-panel',
  host: { class: 'side-panel' },
  imports: [RouterLink, MatButtonModule, SharedIconModule, SkeletonComponent],
  templateUrl: './account-panel.component.html',
})
export class AccountPanelComponent {
  readonly #dialogRef = inject(DialogRef);
  readonly #auth = inject(AuthService);
  readonly #profiles = inject(UserProfileService);
  readonly #orders = inject(ShopperOrdersService);
  readonly #favorites = inject(FavoritesService);

  readonly #uid = computed(() => this.#auth.user()?.uid ?? '');

  readonly profile = rxResource({
    params: () => this.#uid() || undefined,
    stream: ({ params: uid }) => (uid ? this.#profiles.watch(uid) : of(null)),
  });

  readonly latestOrder = rxResource({
    params: () => this.#uid() || undefined,
    stream: ({ params: uid }) => (uid ? this.#orders.watch(uid, 1) : of([])),
  });

  readonly isAdmin = this.#auth.isAdmin;
  readonly email = computed(() => this.#auth.user()?.email ?? '');
  readonly name = computed(() =>
    accountDisplayName(
      this.profile.hasValue() ? this.profile.value()?.name : null,
      this.#auth.user()?.displayName,
      this.email(),
    ),
  );
  readonly initial = computed(() => accountInitial(this.name()));
  /** Only once the profile has loaded, so the prompt doesn't flash for a complete profile. */
  readonly showCompleteProfile = computed(
    () => this.profile.hasValue() && isProfileIncomplete(this.profile.value()),
  );

  readonly latest = computed(() =>
    this.latestOrder.hasValue() ? (this.latestOrder.value()[0] ?? null) : null,
  );
  readonly latestLoading = computed(() => this.latestOrder.isLoading() && !this.latestOrder.hasValue());

  readonly favoritesReady = this.#favorites.ready;
  readonly favoritesCount = this.#favorites.count;

  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);

  close(): void {
    this.#dialogRef.close();
  }

  signOut(): void {
    this.close();
    void this.#auth.logout();
  }
}
