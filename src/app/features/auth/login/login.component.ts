import { Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth/auth.service';
import { looksLikeEmail } from '@core/services/auth/auth.utils';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import type { SignupConsent } from '@core/services/user-profile';
import { LoaderComponent } from '@shared/ui/loader/loader.component';
import { PasswordInputComponent } from '@shared/ui/forms/password-input/password-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { ConsentChoicesComponent } from './components/consent-choices/consent-choices.component';
import { createLoginForm } from '../utils/login-form';
import { leaveAfterSignIn } from '../utils/login-exit';

type LoginAction = 'google' | 'email' | 'reset' | 'consent';

const TERMS_REQUIRED_MESSAGE = 'Tick the box to agree to the Terms and Conditions and Privacy Policy.';

const PASSWORD_RESET_NOTICE = "If an account uses that email, we've sent a link to reset the password.";

@Component({
  selector: 'app-login',
  host: { class: 'block w-full' },
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    LoaderComponent,
    TextInputComponent,
    PasswordInputComponent,
    ConsentChoicesComponent,
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

  readonly #busy = signal<LoginAction | ''>('');
  /** The last action that worked. Its button keeps the spinner while the page leaves. */
  readonly #lastAction = signal<LoginAction | ''>('');
  readonly #errorMessage = signal('');
  readonly #notice = signal('');
  readonly termsAccepted = signal(false);
  readonly marketingOptIn = signal(false);
  /** Set when someone tries to continue without ticking the terms box. */
  readonly #termsMissing = signal(false);

  readonly isCreateIntent = computed(() => this.intent() === 'create');
  /** Shown under the terms box until it is ticked. Buttons stay enabled so this can explain why. */
  readonly termsError = computed(() =>
    this.#termsMissing() && !this.termsAccepted() ? TERMS_REQUIRED_MESSAGE : '',
  );

  /**
   * Signed in and nothing keeps the person here: `leaveAfterSignIn` is about to
   * navigate. The page holds its last state (spinner) instead of flashing the form.
   */
  readonly #leaving = computed(
    () => this.#auth.isAuthenticated() && !this.#auth.needsGoogleLink() && !this.#auth.needsConsent(),
  );
  readonly #active = computed(() => this.#busy() || (this.#leaving() ? this.#lastAction() : ''));

  /**
   * Before Firebase restores a session (or finishes the terms check), and while a person who
   * arrived already signed in is being sent on, show a loader instead of a form they can't use.
   * After a button press the form stays, with that button's spinner (`#lastAction`).
   */
  readonly showPageLoader = computed(
    () =>
      this.#busy() === '' &&
      this.#lastAction() === '' &&
      (!this.#auth.isAuthReady() || !this.#auth.consentReady() || this.#leaving()),
  );
  readonly isBusy = computed(() => this.#active() !== '');
  readonly isGoogleBusy = computed(() => this.#active() === 'google');
  readonly isEmailBusy = computed(() => this.#active() === 'email');
  readonly isResetting = computed(() => this.#active() === 'reset');
  readonly isConsentBusy = computed(() => this.#active() === 'consent');
  /** The "Almost done" step stays on screen after Continue until the page leaves. */
  readonly showConsentStep = computed(() => this.#auth.needsConsent() || this.isConsentBusy());
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
    this.#resetOnModeSwitch();
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

  /**
   * Same button on both modes, always enabled: Google signs in a returning person and
   * creates the account for a new one. A new person who has not ticked the terms box here
   * gets the "Almost done" step next (`AuthService.needsConsent`), so no account skips it.
   */
  async continueWithGoogle(): Promise<void> {
    if (this.isBusy()) return;
    await this.#run('google', async () => {
      const consent = this.isCreateIntent() && this.termsAccepted() ? this.#consentDraft() : undefined;
      const outcome = await this.#auth.loginWithGoogle(consent);
      if (outcome === 'popup') this.#snackbar.success('Signed in');
    });
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isBusy()) return;
    const termsMissing = this.isCreateIntent() && !this.#auth.needsGoogleLink() && !this.termsAccepted();
    this.#termsMissing.set(termsMissing);
    submit(this.loginForm, async () => {
      if (termsMissing) return;
      await this.#run('email', async () => {
        const draft = this.#draft.model();
        if (this.#auth.needsGoogleLink()) {
          await this.#auth.linkPendingGoogle(draft.email, draft.password);
          this.#snackbar.success('Google is connected. Signed in.');
          return;
        }
        if (this.isCreateIntent()) {
          await this.#auth.register(draft.email, draft.password, this.#consentDraft());
          // `AuthService` sends the "Confirm Your Email" message by itself once the new account is ready.
          this.#snackbar.success('Account created');
          return;
        }
        await this.#auth.login(draft.email, draft.password);
        this.#snackbar.success('Signed in');
      });
    });
  }

  async saveConsent(): Promise<void> {
    // Continue stays disabled until the terms box is ticked.
    if (this.isBusy() || !this.#auth.needsConsent() || !this.termsAccepted()) return;
    await this.#run('consent', async () => {
      await this.#auth.completeConsent(this.#consentDraft());
      this.#snackbar.success("You're all set");
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

  #consentDraft(): SignupConsent {
    return {
      termsAccepted: this.termsAccepted(),
      marketingOptIn: this.marketingOptIn(),
    };
  }

  async #run(kind: LoginAction, action: () => Promise<void>): Promise<void> {
    this.#clearFeedback();
    this.#busy.set(kind);
    this.#lastAction.set(kind);
    try {
      await action();
    } catch (error) {
      this.#lastAction.set('');
      this.#notice.set('');
      this.#errorMessage.set(this.#auth.mapFirebaseError(error));
    } finally {
      this.#busy.set('');
    }
  }

  /**
   * Sign in and Create account share one route, so switching keeps this component.
   * Start the new mode clean: typed values stay, but errors from the other mode go.
   * Skips the first run so a Google redirect error on arrival is still shown.
   */
  #resetOnModeSwitch(): void {
    let shownMode: boolean | undefined;
    effect(() => {
      const create = this.isCreateIntent();
      if (shownMode !== undefined && shownMode !== create) {
        untracked(() => {
          this.loginForm().reset();
          this.#clearFeedback();
        });
      }
      shownMode = create;
    });
  }

  #clearFeedback(): void {
    this.#termsMissing.set(false);
    this.#errorMessage.set('');
    this.#notice.set('');
    this.#auth.clearRedirectError();
  }
}
