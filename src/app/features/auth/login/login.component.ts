import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth/auth.service';
import { looksLikeEmail } from '@core/services/auth/auth.utils';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { SignupConsent } from '@core/services/user-profile';
import { PasswordInputComponent } from '@shared/ui/forms/password-input/password-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { createLoginForm } from '../utils/login-form';
import { leaveAfterSignIn } from '../utils/login-exit';

const PASSWORD_RESET_NOTICE =
  "If an account uses that email, we've sent a link to reset the password.";

@Component({
  selector: 'app-login',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    TextInputComponent,
    PasswordInputComponent,
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #draft = createLoginForm(this.#auth.pendingGoogleEmail);

  /** From `?returnUrl=` via `withComponentInputBinding`. */
  readonly returnUrl = input<string>('/');
  /** From `?intent=create` — Create account mode (terms required before new accounts). */
  readonly intent = input<string | undefined>(undefined);

  readonly auth = this.#auth;
  readonly loginForm = this.#draft.loginForm;

  readonly #busy = signal<'google' | 'email' | 'reset' | 'consent' | ''>('');
  readonly #errorMessage = signal('');
  readonly #notice = signal('');
  readonly termsAccepted = signal(false);
  readonly marketingOptIn = signal(false);

  readonly isCreateIntent = computed(() => this.intent() === 'create');
  readonly showConsent = computed(() => this.isCreateIntent() || this.#auth.needsConsent());
  readonly canSubmitCreate = computed(() => this.termsAccepted());

  readonly isBusy = computed(() => this.#busy() !== '');
  readonly isGoogleBusy = computed(() => this.#busy() === 'google');
  readonly isEmailBusy = computed(() => this.#busy() === 'email');
  readonly isResetting = computed(() => this.#busy() === 'reset');
  readonly isConsentBusy = computed(() => this.#busy() === 'consent');
  readonly notice = this.#notice.asReadonly();
  /** Sign-in / create form feedback (must stay below the password field — AS-34). */
  readonly shownError = computed(() =>
    this.#auth.needsConsent() ? '' : this.#errorMessage() || this.#auth.redirectError(),
  );
  /** Terms step feedback when a brand-new account still needs consent. */
  readonly consentError = computed(() =>
    this.#auth.needsConsent() ? this.#errorMessage() || this.#auth.redirectError() : '',
  );

  constructor() {
    leaveAfterSignIn(this.#auth, this.#router, this.#snackbar, () => this.returnUrl());
  }

  ngOnInit(): void {
    const create = this.isCreateIntent();
    this.#seo.setPageMetadata({
      title: create ? 'Create account | Atteya Store' : 'Sign in | Atteya Store',
      description: create
        ? 'Create an Atteya Store account with Google or email to save favorites and check out.'
        : 'Sign in to Atteya Store with Google or the email and password for your account.',
      noindex: true,
    });
  }

  async continueWithGoogle(): Promise<void> {
    if (this.isBusy()) return;
    if (this.showConsent() && !this.termsAccepted()) {
      this.#errorMessage.set('Accept the Terms and Conditions and Privacy Policy to continue.');
      return;
    }
    await this.#run('google', async () => {
      const consent = this.showConsent() ? this.#consentDraft() : undefined;
      const outcome = await this.#auth.loginWithGoogle(consent);
      if (outcome === 'popup') this.#snackbar.success('Signed in');
    });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isBusy()) return;
    submit(this.loginForm, async () => {
      await this.#run('email', async () => {
        const draft = this.#draft.model();
        if (this.#auth.needsGoogleLink()) {
          await this.#auth.linkPendingGoogle(draft.email, draft.password);
          this.#snackbar.success('Google is connected. Signed in.');
          return;
        }
        if (this.isCreateIntent()) {
          if (!this.termsAccepted()) {
            throw new Error('Accept the Terms and Conditions and Privacy Policy to create an account.');
          }
          await this.#auth.register(draft.email, draft.password, this.#consentDraft());
          this.#snackbar.success('Account created');
          return;
        }
        await this.#auth.login(draft.email, draft.password);
        this.#snackbar.success('Signed in');
      });
    });
  }

  async saveConsent(): Promise<void> {
    if (this.isBusy() || !this.#auth.needsConsent()) return;
    if (!this.termsAccepted()) {
      this.#errorMessage.set('Accept the Terms and Conditions and Privacy Policy to continue.');
      return;
    }
    await this.#run('consent', async () => {
      await this.#auth.completeConsent(this.#consentDraft());
      this.#snackbar.success('Thanks — you are all set');
    });
  }

  async sendReset(): Promise<void> {
    if (this.isBusy()) return;
    const emailAddress = this.#draft.model().email.trim();
    if (!looksLikeEmail(emailAddress)) {
      this.#notice.set('');
      this.#errorMessage.set('Enter the email on the account and we will send a reset link.');
      return;
    }

    await this.#run('reset', async () => {
      await this.#auth.sendPasswordReset(emailAddress);
      this.#notice.set(PASSWORD_RESET_NOTICE);
    });
  }

  useDifferentAccount(): void {
    this.#auth.clearPendingGoogle();
    this.#clearFeedback();
  }

  onTermsChange(checked: boolean): void {
    this.termsAccepted.set(checked);
  }

  onMarketingChange(checked: boolean): void {
    this.marketingOptIn.set(checked);
  }

  #consentDraft(): SignupConsent {
    return {
      termsAccepted: this.termsAccepted(),
      marketingOptIn: this.marketingOptIn(),
    };
  }

  async #run(
    kind: 'google' | 'email' | 'reset' | 'consent',
    action: () => Promise<void>,
  ): Promise<void> {
    this.#clearFeedback();
    this.#busy.set(kind);
    try {
      await action();
    } catch (error) {
      this.#notice.set('');
      this.#errorMessage.set(this.#auth.mapFirebaseError(error));
    } finally {
      this.#busy.set('');
    }
  }

  #clearFeedback(): void {
    this.#errorMessage.set('');
    this.#notice.set('');
    this.#auth.clearRedirectError();
  }
}
