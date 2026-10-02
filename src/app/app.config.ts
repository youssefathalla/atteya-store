import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { translocoConfig } from '@core/i18n/transloco.config';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Binds route params, query params, static route data and resolver output
    // straight to component input() signals. See AGENTS.md -> Routing.
    provideRouter(routes, withComponentInputBinding()),
    provideNativeDateAdapter(),
    provideHttpClient(),
    provideTransloco(translocoConfig),
    // Use the self-hosted Material Symbols Outlined font (see src/styles/_fonts.scss)
    // instead of the default 'material-icons' class, which requires the Google Fonts CDN.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    provideClientHydration(withEventReplay()),
  ],
};
