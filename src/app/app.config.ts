import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
  withAutoCleanupInjectors,
  withPreloading,
} from '@angular/router';
import { StorefrontPreloadingStrategy } from '@core/routing/storefront-preloading.strategy';
import { provideClientHydration } from '@angular/platform-browser';
import { IMAGE_CONFIG } from '@angular/common';
import { provideAtteyaImageKitLoader } from '@core/image/image-kit.loader';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { routes } from './app.routes';
import { environment } from '@env/environment';
import {
  provideFirebaseApp,
  provideAuth,
  provideFirestore,
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
      withPreloading(StorefrontPreloadingStrategy),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),

    // Modern SSR Hydration: DOM reconciliation + TransferCache + Incremental hydration + Event replay (all enabled by default in v22+)
    provideClientHydration(),

    ...provideAtteyaImageKitLoader(),
    {
      provide: IMAGE_CONFIG,
      useValue: {
        breakpoints: [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048],
      },
    },

    provideNativeDateAdapter(),
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },

    // Modular Firebase Suite
    provideFirebaseApp(environment.firebase),
    provideAuth(),
    provideFirestore(),
    provideAppCheck(environment.appCheck),
  ],
};
