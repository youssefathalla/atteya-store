import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideEnvironmentInitializer,
  afterNextRender,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { AppCheck } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_APP_CHECK } from '../firebase.tokens';

export interface AppCheckOptions {
  siteKey: string;
  isTokenAutoRefreshEnabled?: boolean;
  debug?: boolean;
  isEnterprise?: boolean;
}

let appCheckInstance: AppCheck | null = null;
let appCheckInitPromise: Promise<AppCheck | null> | undefined;

async function initAppCheck(app: FirebaseApp, options: AppCheckOptions): Promise<AppCheck | null> {
  if (appCheckInstance) {
    return appCheckInstance;
  }
  if (appCheckInitPromise) {
    return appCheckInitPromise;
  }

  appCheckInitPromise = (async () => {
    if (options.debug && typeof window !== 'undefined') {
      (
        window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    const { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } =
      await import('firebase/app-check');

    const provider =
      options.isEnterprise !== false
        ? new ReCaptchaEnterpriseProvider(options.siteKey)
        : new ReCaptchaV3Provider(options.siteKey);

    appCheckInstance = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: options.isTokenAutoRefreshEnabled ?? true,
    });
    return appCheckInstance;
  })().catch((error: unknown) => {
    appCheckInitPromise = undefined;
    throw error;
  });

  return appCheckInitPromise;
}

export function provideAppCheck(options?: AppCheckOptions | null): EnvironmentProviders {
  if (!options?.siteKey) {
    return makeEnvironmentProviders([]);
  }

  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP_CHECK,
      useFactory: (): AppCheck | null => appCheckInstance,
    },
    provideEnvironmentInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }
      const app = inject(FIREBASE_APP);
      afterNextRender(() => {
        void initAppCheck(app, options);
      });
    }),
  ]);
}
