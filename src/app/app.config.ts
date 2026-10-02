import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
  withAutoCleanupInjectors,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { translocoConfig } from '@core/i18n/transloco.config';
import { environment } from '@env/environment';
import {
  provideFirebaseApp,
  provideAuth,
  provideFirestore,
  provideStorage,
  provideFunctions,
  provideAppCheck,
} from '@core/firebase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Modern Router: input binding + scroll restoration + view transitions + preloading + auto cleanup
    provideRouter(
      routes,
      withComponentInputBinding(),
      withAutoCleanupInjectors(),
      withViewTransitions(),
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),

    // Modern SSR Hydration: DOM reconciliation + TransferCache + Incremental hydration + Event replay (all enabled by default in v22+)
    provideClientHydration(),

    provideNativeDateAdapter(),
    provideTransloco(translocoConfig),
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },

    // Modular Firebase Suite
    provideFirebaseApp(environment.firebase),
    provideAuth({ useEmulator: environment.useEmulators }),
    provideFirestore({ useEmulator: environment.useEmulators }),
    provideStorage({ useEmulator: environment.useEmulators }),
    provideFunctions({ useEmulator: environment.useEmulators }),
    provideAppCheck(environment.appCheck),
  ],
};
