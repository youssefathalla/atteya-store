import { EnvironmentProviders, makeEnvironmentProviders, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getFirestore, initializeFirestore, Firestore, FirestoreSettings } from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIRESTORE } from '../firebase.tokens';
import { connectFirestore } from '../firebase-emulators';

export interface FirestoreOptions {
  useEmulator?: boolean;
  settings?: FirestoreSettings;
}

export function provideFirestore(options?: FirestoreOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIRESTORE,
      useFactory: (app: FirebaseApp, platformId: object): Firestore => {
        let firestore: Firestore;
        try {
          firestore = options?.settings ? initializeFirestore(app, options.settings) : getFirestore(app);
        } catch {
          firestore = getFirestore(app);
        }

        if (options?.useEmulator && isPlatformBrowser(platformId)) {
          connectFirestore(firestore);
        }
        return firestore;
      },
      deps: [FIREBASE_APP, PLATFORM_ID],
    },
  ]);
}
