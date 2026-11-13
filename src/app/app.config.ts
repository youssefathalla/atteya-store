import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
  withAutoCleanupInjectors,
  withPreloading,
  withNavigationErrorHandler,
} from '@angular/router';
import { AppErrorHandler, isChunkLoadError, PageLoadErrorService } from '@core/services/errors';
import { MetaPixelService } from '@core/services/analytics/meta-pixel.service';
import { StorefrontPreloadingStrategy } from '@core/routing/storefront-preloading.strategy';
import { provideClientHydration } from '@angular/platform-browser';
import { IMAGE_CONFIG } from '@angular/common';
import { provideAtteyaImageKitLoader } from '@core/image/image-kit.loader';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { routes } from './app.routes';
import { environment } from '@env/environment';
import { provideFirebaseApp, provideAuth, provideFirestore, provideAppCheck } from '@core/firebase';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // A page whose code couldn't be downloaded shows Something Went Wrong (ATS-268).
    { provide: ErrorHandler, useClass: AppErrorHandler },
    // Modern Router: input binding + scroll restoration + view transitions + preloading + auto cleanup
    provideRouter(
      routes,
      withComponentInputBinding(),
      withAutoCleanupInjectors(),
      withViewTransitions({
        // Query-only updates (shop filters) must not crossfade the whole page.
        onViewTransitionCreated: ({ transition, from, to }) => {
          const pathOf = (snap: typeof from) =>
            snap.pathFromRoot.flatMap((s) => s.url.map((segment) => segment.path)).join('/');
          if (pathOf(from) === pathOf(to)) {
            transition.skipTransition();
          }
        },
      }),
      withPreloading(StorefrontPreloadingStrategy),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      withNavigationErrorHandler((error) => {
        if (isChunkLoadError(error.error)) inject(PageLoadErrorService).report(error.url);
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

    // Meta Pixel for the client's ads: browser only, live store only (ATS-290).
    provideAppInitializer(() => inject(MetaPixelService).start()),
  ],
};
