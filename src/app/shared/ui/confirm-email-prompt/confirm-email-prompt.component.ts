import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/services/auth/auth.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import { SharedIconModule } from '@shared/ui/mat-icon';

const SEND_FAILED = "We couldn't send the email. Please try again in a moment.";

/**
 * "Confirm your email" with a **Resend Email** button, shown only while the signed-in
 * email/password account is unconfirmed (`AuthService.emailNeedsConfirming()`; Google sign-ins
 * never see it). Used in the account panel and on `/account`. It goes away by itself once the
 * account reloads as confirmed (on page open and when the tab comes back into view).
 */
@Component({
  selector: 'app-confirm-email-prompt',
  host: { class: 'block w-full' },
  imports: [MatButtonModule, MatProgressSpinnerModule, SharedIconModule],
  template: `
    @if (show()) {
      <div class="confirm-email-prompt" role="status">
        <mat-icon name="mail" size="xl" aria-hidden="true" />
        <div class="flex-1 min-w-0">
          <p class="font-label-lg font-bold!">Confirm your email</p>
          <p class="font-body-sm text-on-surface-variant break-words">
            Open the link we emailed to {{ email() }} to confirm it.
          </p>
        </div>
        <button
          matButton="outlined"
          type="button"
          [disabled]="sending()"
          [attr.aria-label]="sending() ? 'Sending a new link...' : null"
          (click)="resend()"
        >
          @if (sending()) {
            <mat-progress-spinner mode="indeterminate" diameter="18" />
          } @else {
            <span>Resend Email</span>
          }
        </button>
      </div>
    }
  `,
})
export class ConfirmEmailPromptComponent {
  readonly #auth = inject(AuthService);
  readonly #snackbar = inject(SnackbarService);

  readonly show = this.#auth.emailNeedsConfirming;
  readonly email = computed(() => this.#auth.user()?.email ?? '');
  readonly sending = signal(false);

  async resend(): Promise<void> {
    if (this.sending()) return;
    this.sending.set(true);
    try {
      const sentTo = await this.#auth.sendVerificationEmail();
      if (sentTo) this.#snackbar.success(`We sent a new link to ${sentTo}.`);
    } catch (error) {
      this.#snackbar.error(callableMessage(error) ?? SEND_FAILED);
    } finally {
      this.sending.set(false);
    }
  }
}
