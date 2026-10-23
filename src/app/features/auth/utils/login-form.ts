import { Signal, linkedSignal } from '@angular/core';
import { email, form, required } from '@angular/forms/signals';

export interface LoginDraft {
  email: string;
  password: string;
}

export function createLoginForm(pendingEmail: Signal<string>) {
  const model = linkedSignal<string, LoginDraft>({
    source: pendingEmail,
    computation: (emailAddress, previous) => ({
      email: emailAddress || previous?.value.email || '',
      password: previous?.value.password || '',
    }),
  });

  const loginForm = form(model, (path) => {
    required(path.email, { message: 'Enter your email.' });
    email(path.email, { message: 'Enter a valid email address.' });
    required(path.password, { message: 'Enter your password.' });
  });

  return { model, loginForm };
}
