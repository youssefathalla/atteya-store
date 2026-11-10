import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { doc, getDoc } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { authErrorCode } from '@core/services/auth/auth.utils';
import { CheckoutOrderService } from '@core/services/orders/checkout-order.service';
import { ORDERS_COLLECTION } from '@core/services/orders/order.schema';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import {
  markClaimAfterRedirect,
  readGuestOrder,
  rememberGuestOrder,
  takeClaimAfterRedirect,
} from '../../utils/guest-order-storage';

const CLAIM_FAILED = "We couldn't save this order to your account. Try again in a moment.";

/** What the card shows. `hidden` renders nothing. */
type CardMode = 'hidden' | 'offer' | 'created' | 'saved' | 'exists' | 'claim' | 'message';

/**
 * After a guest order: offer to save it to an account (optional, only after the order).
 * Signed out: Create Account with the order's email, Continue with Google, or Skip (remembered
 * for this order). Signed in with the order's confirmed email: Save to My Account. Saving goes
 * through `claimOrder`, which accepts only a confirmed account email equal to the order's email.
 */
@Component({
  selector: 'app-guest-account-card',
  host: { class: 'block w-full' },
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './guest-account-card.component.html',
})
export class GuestAccountCardComponent implements OnInit {
  readonly orderId = input.required<string>();
  readonly viewKey = input.required<string>();
  /** The email this device placed the order with; null when the link was opened elsewhere. */
  readonly email = input<string | null>(null);

  readonly #auth = inject(AuthService);
  readonly #orders = inject(CheckoutOrderService);
  readonly #firestore = injectFirestore();
  readonly #platformId = inject(PLATFORM_ID);

  readonly password = signal('');
  readonly marketingOptIn = signal(false);
  readonly busy = signal<'create' | 'google' | 'claim' | null>(null);
  /** Something to tell the shopper (a refused save, a sign-up problem). */
  readonly message = signal('');
  readonly #outcome = signal<'created' | 'saved' | 'exists' | null>(null);
  readonly #skipped = signal(false);

  /** Sign In from the card comes back to this order (its key stays saved on this device). */
  readonly returnUrl = computed(() => `/checkout/confirmation/${this.orderId()}`);

  /**
   * True when the signed-in person can already read the order as its owner (saved before), so
   * there is nothing to offer. A refused read means it isn't theirs.
   */
  readonly #owned = resource({
    params: () => {
      const uid = this.#auth.user()?.uid;
      return uid ? { uid, id: this.orderId() } : undefined;
    },
    loader: async ({ params }) => {
      try {
        const snap = await getDoc(doc(this.#firestore, ORDERS_COLLECTION, params.id));
        return snap.exists() && snap.get('customerId') === params.uid;
      } catch {
        return false;
      }
    },
  });

  /** Signed in with a confirmed email that is the order's (when this device knows it). */
  readonly #canClaim = computed(() => {
    const user = this.#auth.user();
    if (!user?.emailVerified || !user.email) return false;
    const email = this.email();
    return email === null || email === user.email.trim().toLowerCase();
  });

  readonly mode = computed((): CardMode => {
    if (!this.#auth.isAuthReady()) return 'hidden';
    const outcome = this.#outcome();
    if (outcome) return outcome;
    // Signing in from the offer: keep it on screen until the result is known.
    const busy = this.busy();
    if (busy === 'create' || busy === 'google') return 'offer';
    if (this.#auth.user()) {
      if (this.message()) return 'message';
      if (!this.#owned.hasValue() || this.#owned.value()) return 'hidden';
      return this.#canClaim() ? 'claim' : 'hidden';
    }
    return this.#skipped() ? 'hidden' : 'offer';
  });

  constructor() {
    // Back from a Google redirect started on this card: save the order now.
    effect(() => {
      if (!this.#auth.isAuthReady() || !this.#auth.user()) return;
      untracked(() => {
        if (takeClaimAfterRedirect(this.orderId())) void this.claim();
      });
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.#platformId)) this.#skipped.set(readGuestOrder(this.orderId()).skipped);
  }

  skip(): void {
    rememberGuestOrder(this.orderId(), { skipped: true });
    this.#skipped.set(true);
  }

  async createAccount(): Promise<void> {
    const email = this.email();
    if (!email || this.busy()) return;
    if (!this.password()) {
      this.message.set('Choose a password for your account.');
      return;
    }
    this.message.set('');
    this.busy.set('create');
    try {
      // Placing the order already meant agreeing to the terms; the account records it now.
      await this.#auth.register(email, this.password(), {
        termsAccepted: true,
        marketingOptIn: this.marketingOptIn(),
      });
      // A new email/password account isn't confirmed yet, so `claimOrder` would refuse it.
      this.#outcome.set('created');
    } catch (error) {
      if (authErrorCode(error) === 'auth/email-already-in-use') {
        this.#outcome.set('exists');
      } else {
        this.message.set(this.#auth.mapFirebaseError(error));
      }
    } finally {
      this.busy.set(null);
    }
  }

  async continueWithGoogle(): Promise<void> {
    if (this.busy()) return;
    this.message.set('');
    this.busy.set('google');
    try {
      markClaimAfterRedirect(this.orderId());
      const outcome = await this.#auth.loginWithGoogle({
        termsAccepted: true,
        marketingOptIn: this.marketingOptIn(),
      });
      // A redirect leaves the page; the order is saved when it loads again.
      if (outcome === 'redirect') return;
      takeClaimAfterRedirect(this.orderId());
      // The email already has a password account: sign in with it instead.
      if (outcome === 'link') {
        this.#auth.clearPendingGoogle();
        this.#outcome.set('exists');
        return;
      }
      this.busy.set(null);
      await this.claim();
    } catch (error) {
      takeClaimAfterRedirect(this.orderId());
      this.message.set(this.#auth.mapFirebaseError(error));
    } finally {
      if (this.busy() === 'google') this.busy.set(null);
    }
  }

  /** Saves the guest order to the signed-in account. Refused (wrong or unconfirmed email): says why. */
  async claim(): Promise<void> {
    if (this.busy()) return;
    this.message.set('');
    this.busy.set('claim');
    try {
      await this.#orders.claimOrder(this.orderId(), this.viewKey());
      this.#outcome.set('saved');
    } catch (error) {
      this.message.set(callableMessage(error) ?? CLAIM_FAILED);
    } finally {
      this.busy.set(null);
    }
  }
}
