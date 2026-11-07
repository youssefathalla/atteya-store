import { Service } from '@angular/core';
import { callableFrom, injectFunctionsAsync } from '@core/firebase';

/** Where the sign-up form sits. Must match `EMAIL_SIGNUP_SOURCES` in `functions/src/marketing/email-signup.ts`. */
export type EmailSignupSource = 'footer';

export interface EmailSignupRequest {
  readonly email: string;
  readonly source: EmailSignupSource;
  /** Site path the form was on, e.g. `/product/nox-at10`. */
  readonly page: string;
}

export interface EmailSignupResult {
  readonly status: 'subscribed' | 'already-subscribed';
}

/**
 * Email sign-up for new arrivals and offers. Goes through the `subscribeToEmails` callable;
 * the list (`emailSignups`) is never read or written from the browser.
 */
@Service()
export class EmailSignupService {
  readonly #functions = injectFunctionsAsync();

  async subscribe(request: EmailSignupRequest): Promise<EmailSignupResult> {
    const call = await callableFrom<EmailSignupRequest, EmailSignupResult>(
      this.#functions(),
      'subscribeToEmails',
    );
    const response = await call(request);
    return response.data;
  }
}
