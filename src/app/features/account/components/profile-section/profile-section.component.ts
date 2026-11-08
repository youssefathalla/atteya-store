import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { shopperWhatsappNumber } from '@core/config/order-messages';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { UserProfileService, type UserProfile } from '@core/services/user-profile';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

const NAME_MAX = 120;
const PHONE_MAX = 20;

/**
 * Account → Profile: name and phone (saved to `users/{uid}`), email read-only.
 * An Egyptian number must be a WhatsApp mobile; other numbers need their country code.
 */
@Component({
  selector: 'app-profile-section',
  host: { class: 'block w-full account-section' },
  imports: [MatButtonModule, MatProgressSpinnerModule, SharedIconModule, SkeletonComponent, TextInputComponent],
  templateUrl: './profile-section.component.html',
})
export class ProfileSectionComponent {
  readonly #profiles = inject(UserProfileService);
  readonly #snackbar = inject(SnackbarService);

  readonly uid = input.required<string>();
  readonly email = input.required<string>();
  readonly profile = input.required<UserProfile | null>();
  readonly loading = input(false);

  readonly isSaving = signal(false);

  /** Saved values; only a real change (not an email choice) refills the form. */
  readonly #saved = computed(
    () => ({ name: this.profile()?.name ?? '', phone: this.profile()?.phone ?? '' }),
    { equal: (a, b) => a.name === b.name && a.phone === b.phone },
  );

  /** Refills from the saved values when they change (after a save or on another device). */
  readonly model = linkedSignal(() => ({ ...this.#saved() }));

  readonly profileForm = form(this.model, (path) => {
    validate(path.name, ({ value }) => {
      const name = value().trim();
      if (!name) return { kind: 'name', message: 'Enter your name.' };
      if (name.length > NAME_MAX) return { kind: 'name', message: 'Your name must be 120 characters or fewer.' };
      return undefined;
    });
    validate(path.phone, ({ value }) => {
      const phone = value().trim();
      if (!phone) return undefined;
      if (phone.length > PHONE_MAX || shopperWhatsappNumber(phone, 'EG') === null) {
        return {
          kind: 'phone',
          message: 'Enter an Egyptian mobile, e.g. 010 1234 5678, or start with your country code, e.g. +971.',
        };
      }
      return undefined;
    });
  });

  save(event: Event): void {
    event.preventDefault();
    if (this.isSaving()) return;
    void submit(this.profileForm, async () => {
      this.isSaving.set(true);
      try {
        await this.#profiles.saveDetails(this.uid(), this.model());
        this.#snackbar.success('Your details are saved.');
      } catch {
        this.#snackbar.error("We couldn't save your details. Please try again in a moment.");
      } finally {
        this.isSaving.set(false);
      }
    });
  }
}
