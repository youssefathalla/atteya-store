import { isPlatformBrowser } from '@angular/common';
import { EnvironmentProviders, inject, makeEnvironmentProviders, PLATFORM_ID } from '@angular/core';
import { FirebaseError, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { FIREBASE_APP, FIREBASE_AUTH } from '../firebase.tokens';

/**
 * Browser auth omits `popupRedirectResolver`, so `__/auth/iframe.js` and gapi
 * stay unloaded until a sign-in call passes `browserPopupRedirectResolver`.
 * The server keeps `getAuth()`, which does not touch browser persistence.
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_AUTH,
      useFactory: (): Auth => {
        const app = inject(FIREBASE_APP);
        if (!isPlatformBrowser(inject(PLATFORM_ID))) {
          return getAuth(app);
        }
        return browserAuth(app);
      },
    },
  ]);
}

function browserAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw error;
  }
}
