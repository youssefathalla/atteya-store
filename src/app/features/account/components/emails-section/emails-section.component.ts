import { Component, computed, inject, input, signal } from '@angular/core';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { UserProfileService, type UserProfile } from '@core/services/user-profile';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

/**
 * Account → Emails: offers and new arrivals by email on or off. Saves at once to
 * `users/{uid}.marketingOptIn` and stamps `marketingOptInAt`.
 */
@Component({
  selector: 'app-emails-section',
  host: { class: 'block w-full account-section' },
  imports: [MatSlideToggleModule, SharedIconModule, SkeletonComponent],
  templateUrl: './emails-section.component.html',
})
export class EmailsSectionComponent {
  readonly #profiles = inject(UserProfileService);
  readonly #snackbar = inject(SnackbarService);

  readonly uid = input.required<string>();
  readonly profile = input.required<UserProfile | null>();
  readonly loading = input(false);

  readonly isSaving = signal(false);
  readonly optedIn = computed(() => this.profile()?.marketingOptIn === true);

  async toggle(event: MatSlideToggleChange): Promise<void> {
    const optIn = event.checked;
    this.isSaving.set(true);
    try {
      await this.#profiles.setMarketingOptIn(this.uid(), optIn);
      this.#snackbar.success(
        optIn ? "You'll get offers and new arrivals by email." : "We won't send you offer emails.",
      );
    } catch {
      // Put the switch back to what is saved.
      event.source.checked = this.optedIn();
      this.#snackbar.error("We couldn't save your choice. Please try again in a moment.");
    } finally {
      this.isSaving.set(false);
    }
  }
}
