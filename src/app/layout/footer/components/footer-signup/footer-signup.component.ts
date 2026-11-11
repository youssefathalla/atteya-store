import { Component, inject, signal } from '@angular/core';
import { email, form, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { EmailSignupService } from '../../services/email-signup.service';
import { SIGNUP_MESSAGES, signupErrorMessage } from '../../utils/signup-message';

interface SignupDraft {
  email: string;
}

interface SignupFeedback {
  readonly tone: 'success' | 'error';
  readonly text: string;
}

/**
 * Footer email sign-up (new arrivals and offers). The footer mounts it only for visitors who
 * aren't signed in; signed-in shoppers will manage emails from their account.
 */
@Component({
  selector: 'app-footer-signup',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatProgressSpinnerModule, TextInputComponent],
  templateUrl: './footer-signup.component.html',
})
export class FooterSignupComponent {
  readonly #signup = inject(EmailSignupService);
  readonly #router = inject(Router);

  readonly #draft = signal<SignupDraft>({ email: '' });
  readonly signupForm = form(this.#draft, (path) => {
    required(path.email, { message: 'Enter your email.' });
    email(path.email, { message: 'Enter a valid email address.' });
  });

  readonly isSending = signal(false);
  readonly feedback = signal<SignupFeedback | null>(null);

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.isSending()) return;
    void submit(this.signupForm, async () => {
      this.isSending.set(true);
      this.feedback.set(null);
      try {
        const { status } = await this.#signup.subscribe({
          email: this.#draft().email.trim(),
          source: 'footer',
          page: this.#router.url.split(/[?#]/)[0].slice(0, 200) || '/',
        });
        this.signupForm().reset({ email: '' });
        this.feedback.set({ tone: 'success', text: SIGNUP_MESSAGES[status] });
      } catch (caught: unknown) {
        this.feedback.set({ tone: 'error', text: signupErrorMessage(caught) });
      } finally {
        this.isSending.set(false);
      }
    });
  }
}
