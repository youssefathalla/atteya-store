import { EnvironmentProviders, makeEnvironmentProviders, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getAuth, Auth } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_AUTH } from '../firebase.tokens';
import { connectAuth } from '../firebase-emulators';

export interface AuthOptions {
  useEmulator?: boolean;
}

export function provideAuth(options?: AuthOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_AUTH,
      useFactory: (app: FirebaseApp, platformId: object): Auth => {
        const auth = getAuth(app);
        if (options?.useEmulator && isPlatformBrowser(platformId)) {
          connectAuth(auth);
        }
        return auth;
      },
      deps: [FIREBASE_APP, PLATFORM_ID],
    },
  ]);
}
