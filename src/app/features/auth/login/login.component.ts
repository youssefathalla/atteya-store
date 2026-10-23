import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth/auth.service';
import { looksLikeEmail } from '@core/services/auth/auth.utils';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { PasswordInputComponent } from '@shared/ui/forms/password-input/password-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { createLoginForm } from '../utils/login-form';
import { leaveAfterSignIn } from '../utils/login-exit';

const PASSWORD_RESET_NOTICE =
  "If an account uses that email, we've sent a link to reset the password.";

@Component({
  selector: 'app-login',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatProgressSpinnerModule, TextInputComponent, PasswordInputComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #draft = createLoginForm(this.#auth.pendingGoogleEmail);

  readonly returnUrl = input<string>('/');
  readonly auth = this.#auth;
  readonly loginForm = this.#draft.loginForm;

  readonly #busy = signal<'google' | 'email' | 'reset' | ''>('');
  readonly #errorMessage = signal('');
  readonly #notice = signal('');

  readonly isBusy = computed(() => this.#busy() !== '');
  readonly isGoogleBusy = computed(() => this.#busy() === 'google');
  readonly isEmailBusy = computed(() => this.#busy() === 'email');
  readonly isResetting = computed(() => this.#busy() === 'reset');
  readonly notice = this.#notice.asReadonly();
  readonly shownError = computed(() => this.#errorMessage() || this.#auth.redirectError());
  constructor() {
    leaveAfterSignIn(this.#auth, this.#router, this.#snackbar, () => this.returnUrl());
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Sign in | Atteya Store',
      description: 'Sign in to Atteya Store with Google or the email and password for your account.',
      noindex: true,
    });
  }

  async continueWithGoogle(): Promise<void> {
    if (this.isBusy()) return;
    await this.#run('google', async () => {
      const outcome = await this.#auth.loginWithGoogle();
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
        await this.#auth.login(draft.email, draft.password);
        this.#snackbar.success('Signed in');
      });
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

  async #run(kind: 'google' | 'email' | 'reset', action: () => Promise<void>): Promise<void> {
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
