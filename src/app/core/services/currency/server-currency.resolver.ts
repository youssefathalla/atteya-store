import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { type ResolveFn } from '@angular/router';
import { CurrencyService } from './currency.service';

/** Runs once per SSR navigation after `REQUEST` is wired (not during `APP_INITIALIZER`). */
export const serverCurrencyResolver: ResolveFn<true> = () => {
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }
  return inject(CurrencyService)
    .prepareForServerRender()
    .then(() => true);
};
