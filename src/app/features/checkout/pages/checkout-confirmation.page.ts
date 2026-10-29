import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore, injectPaymentProofsStorageAsync } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import {
  CheckoutOrderService,
  type CreateIntlBankTransferOrderResult,
} from '@core/services/orders/checkout-order.service';
import { OrderSchema, ORDERS_COLLECTION } from '@core/services/orders/order.schema';
import { displayDecimals } from '@core/services/offers/engine';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';
import { ref, uploadBytes } from 'firebase/storage';

@Component({
  selector: 'app-checkout-confirmation-page',
  host: { class: 'block w-full' },
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule, SharedIconModule],
  templateUrl: './checkout-confirmation.page.html',
})
export class CheckoutConfirmationPageComponent implements OnInit {
  readonly orderId = input.required<string>();

  readonly #firestore = injectFirestore();
  readonly #proofsStorage = injectPaymentProofsStorageAsync();
  readonly #auth = inject(AuthService);
  readonly #checkout = inject(CheckoutOrderService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly isUploading = signal(false);
  readonly seed = signal<CreateIntlBankTransferOrderResult | null>(readNavigationSeed());

  readonly orderResource = resource({
    params: () => this.orderId(),
    loader: async ({ params: id }) => {
      if (!isPlatformBrowser(this.#platformId)) return null;
      const converter = createValibotConverter(OrderSchema);
      const snap = await getDoc(doc(this.#firestore, ORDERS_COLLECTION, id).withConverter(converter));
      return snap.exists() ? snap.data() : null;
    },
  });

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Order received | Atteya Store',
      description: 'Bank transfer instructions for your order.',
      noindex: true,
    });
  }

  displayTotal(): string {
    const pricing = this.orderResource.value()?.pricing ?? this.seed()?.pricing;
    if (!pricing) return '—';
    return formatMoney(
      pricing.totalDisplay,
      pricing.currency,
      displayDecimals(pricing.currency),
    );
  }

  transferReference(): string {
    return (
      this.orderResource.value()?.transferReference ?? this.seed()?.transferReference ?? '—'
    );
  }

  ibanDetails(): { iban: string; beneficiaryName: string; bankName: string } | null {
    const fromOrder = this.orderResource.value()?.bankTransfer;
    if (fromOrder) {
      return {
        iban: fromOrder.iban,
        beneficiaryName: fromOrder.beneficiaryName,
        bankName: fromOrder.bankName,
      };
    }
    if (this.seed()) {
      return {
        iban: this.seed()!.iban,
        beneficiaryName: this.seed()!.beneficiaryName,
        bankName: this.seed()!.bankName,
      };
    }
    return null;
  }

  whatsAppUrl(): string | null {
    return (
      this.orderResource.value()?.bankTransfer.whatsAppProofUrl ??
      this.seed()?.whatsAppProofUrl ??
      null
    );
  }

  canUploadProof(): boolean {
    const status = this.orderResource.value()?.status ?? this.seed()?.status ?? 'pending';
    return status === 'pending';
  }

  async onProofSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.isUploading() || !this.canUploadProof()) return;
    if (!file.type.match(/^image\/(jpeg|png|webp|avif)$/)) {
      this.#snackbar.error('Choose a JPG, PNG, WebP, or AVIF photo.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.#snackbar.error('Choose a photo under 10 MB.');
      return;
    }
    const user = this.#auth.user();
    if (!user) {
      this.#snackbar.error('Sign in again to upload your proof.');
      return;
    }
    this.isUploading.set(true);
    try {
      const ext = extensionFor(file.type);
      const path = `orders/${this.orderId()}/proof.${ext}`;
      const storage = await this.#proofsStorage();
      // Upload only — never getDownloadURL (tokenized URLs leak). Proofs stay on
      // the private bucket and are read through the Firebase SDK with Auth.
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      await this.#checkout.registerPaymentProof(this.orderId(), path);
      this.#snackbar.success('Thanks — we received your payment photo.');
    } catch {
      this.#snackbar.error('We could not upload that photo. Try again or message us on WhatsApp.');
    } finally {
      this.isUploading.set(false);
    }
  }
}

function readNavigationSeed(): CreateIntlBankTransferOrderResult | null {
  if (typeof history === 'undefined') return null;
  const state = history.state as { checkoutResult?: CreateIntlBankTransferOrderResult };
  return state?.checkoutResult ?? null;
}

function extensionFor(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/avif') return 'avif';
  return 'jpg';
}
