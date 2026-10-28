import { isPlatformBrowser } from '@angular/common';
import { Component, effect, inject, PLATFORM_ID, resource, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import {
  DEFAULT_PAYMENT_SETTINGS_DOC,
  PaymentSettingsSchema,
} from '@core/services/payments/payment-settings.schema';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';

@Component({
  selector: 'app-payments-tab',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './payments-tab.component.html',
})
export class PaymentsTabComponent {
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly draft = signal({ ...DEFAULT_PAYMENT_SETTINGS_DOC });
  readonly isSaving = signal(false);

  readonly settingsResource = resource({
    loader: async () => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const ref = doc(this.#firestore, 'settings', 'payments').withConverter(
        createValibotConverter(PaymentSettingsSchema),
      );
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
  });

  constructor() {
    effect(() => {
      const loaded = this.settingsResource.value();
      if (!loaded) return;
      untracked(() => {
        this.draft.set({
          beneficiaryName: loaded.beneficiaryName,
          bankName: loaded.bankName,
          iban: loaded.iban,
          whatsAppNumber: loaded.whatsAppNumber,
          internationalShippingFeeEgp: loaded.internationalShippingFeeEgp,
        });
      });
    });
  }

  patch<K extends keyof typeof DEFAULT_PAYMENT_SETTINGS_DOC>(
    key: K,
    value: (typeof DEFAULT_PAYMENT_SETTINGS_DOC)[K],
  ): void {
    this.draft.update((current) => ({ ...current, [key]: value }));
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    const user = this.#auth.user();
    if (!user) return;
    this.isSaving.set(true);
    try {
      const body = this.draft();
      await setDoc(
        doc(this.#firestore, 'settings', 'payments'),
        {
          ...body,
          iban: body.iban.replace(/\s+/g, '').toUpperCase(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true },
      );
      this.#snackbar.success('Bank transfer settings saved.');
      this.settingsResource.reload();
    } catch {
      this.#snackbar.error('We could not save these settings. Try again.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
