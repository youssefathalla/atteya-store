import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { isEgyptMobile } from '@core/config/order-messages';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { UserProfileService, type SavedAddress, type UserProfile } from '@core/services/user-profile';
import {
  CHECKOUT_COUNTRY_OPTIONS,
  countryLabel,
  isCheckoutCountry,
} from '@features/checkout/utils/checkout-countries';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';

interface AddressModel {
  country: string;
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  phone: string;
}

function toModel(address: SavedAddress | null | undefined): AddressModel {
  return {
    country: address && isCheckoutCountry(address.country) ? address.country : 'EG',
    fullName: address?.fullName ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    region: address?.region ?? '',
    postalCode: address?.postalCode ?? '',
    phone: address?.phone ?? '',
  };
}

function textRule(label: string, max: number, required: boolean) {
  return (value: string) => {
    const text = value.trim();
    if (required && !text) return { kind: 'required', message: `Enter your ${label}.` };
    if (text.length > max) return { kind: 'max', message: `This must be ${max} characters or fewer.` };
    return undefined;
  };
}

/**
 * Account → Delivery Address: the one saved address (`users/{uid}.address`), with the same
 * fields checkout asks for in that country. Checkout fills it in when the countries match.
 */
@Component({
  selector: 'app-address-section',
  host: { class: 'block w-full account-section' },
  imports: [
    MatButtonModule,
    MatProgressSpinnerModule,
    SelectInputComponent,
    SharedIconModule,
    SkeletonComponent,
    TextInputComponent,
  ],
  templateUrl: './address-section.component.html',
})
export class AddressSectionComponent {
  readonly #profiles = inject(UserProfileService);
  readonly #snackbar = inject(SnackbarService);

  readonly uid = input.required<string>();
  readonly profile = input.required<UserProfile | null>();
  readonly loading = input(false);

  readonly countries = CHECKOUT_COUNTRY_OPTIONS;
  readonly isSaving = signal(false);

  /** Saved address; only a real change (not a name or email choice) refills the form. */
  readonly #saved = computed(() => this.profile()?.address ?? null, {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  readonly hasSaved = computed(() => this.#saved() !== null);
  readonly savedCountry = computed(() => {
    const saved = this.#saved();
    return saved ? countryLabel(saved.country) : '';
  });

  readonly model = linkedSignal<AddressModel>(() => toModel(this.#saved()));
  readonly isEgypt = computed(() => this.model().country === 'EG');

  readonly addressForm = form(this.model, (path) => {
    validate(path.fullName, ({ value }) => textRule('full name', 120, true)(value()));
    validate(path.line1, ({ value }) => textRule('address', 200, true)(value()));
    validate(path.city, ({ value }) => textRule('city', 80, true)(value()));
    validate(path.line2, ({ value, valueOf }) =>
      valueOf(path.country) === 'EG' ? undefined : textRule('address line 2', 200, false)(value()),
    );
    validate(path.region, ({ value, valueOf }) =>
      valueOf(path.country) === 'EG' ? undefined : textRule('region', 80, false)(value()),
    );
    validate(path.postalCode, ({ value, valueOf }) =>
      valueOf(path.country) === 'EG' ? undefined : textRule('postal code', 20, true)(value()),
    );
    validate(path.phone, ({ value, valueOf }) => {
      const phone = value().trim();
      if (!phone) return { kind: 'required', message: 'Enter a phone number we can reach you on.' };
      if (valueOf(path.country) === 'EG') {
        return isEgyptMobile(phone)
          ? undefined
          : { kind: 'phone', message: 'Enter an Egyptian mobile number, e.g. 010 1234 5678.' };
      }
      if (phone.length < 6 || phone.length > 20) {
        return { kind: 'phone', message: 'Enter your number with its country code, e.g. +971 50 123 4567.' };
      }
      return undefined;
    });
  });

  save(event: Event): void {
    event.preventDefault();
    if (this.isSaving()) return;
    void submit(this.addressForm, async () => {
      const draft = this.model();
      this.isSaving.set(true);
      try {
        await this.#profiles.saveAddress(this.uid(), {
          country: draft.country,
          fullName: draft.fullName,
          line1: draft.line1,
          line2: draft.line2 || null,
          city: draft.city,
          region: draft.region || null,
          postalCode: draft.postalCode,
          phone: draft.phone,
        });
        this.#snackbar.success("Your address is saved. We'll fill it in at checkout.");
      } catch {
        this.#snackbar.error("We couldn't save your address. Please try again in a moment.");
      } finally {
        this.isSaving.set(false);
      }
    });
  }
}
