import { EnvironmentProviders, makeEnvironmentProviders, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  AppCheck,
} from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_APP_CHECK } from '../firebase.tokens';

export interface AppCheckOptions {
  siteKey: string;
  isTokenAutoRefreshEnabled?: boolean;
  debug?: boolean;
  isEnterprise?: boolean;
}

export function provideAppCheck(options?: AppCheckOptions | null): EnvironmentProviders {
  if (!options?.siteKey) return makeEnvironmentProviders([]);

  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP_CHECK,
      useFactory: (app: FirebaseApp, platformId: object): AppCheck | null => {
        if (!isPlatformBrowser(platformId)) {
          return null;
        }

        if (options.debug && typeof window !== 'undefined') {
          (
            window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }
          ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        }

        const provider =
          options.isEnterprise !== false
            ? new ReCaptchaEnterpriseProvider(options.siteKey)
            : new ReCaptchaV3Provider(options.siteKey);

        return initializeAppCheck(app, {
          provider,
          isTokenAutoRefreshEnabled: options.isTokenAutoRefreshEnabled ?? true,
        });
      },
      deps: [FIREBASE_APP, PLATFORM_ID],
    },
  ]);
}
