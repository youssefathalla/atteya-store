import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { getFirestore, initializeFirestore, Firestore, FirestoreSettings } from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIRESTORE } from '../firebase.tokens';

export interface FirestoreOptions {
  settings?: FirestoreSettings;
}

export function provideFirestore(options?: FirestoreOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIRESTORE,
      useFactory: (app: FirebaseApp): Firestore => {
        try {
          return options?.settings ? initializeFirestore(app, options.settings) : getFirestore(app);
        } catch {
          return getFirestore(app);
        }
      },
      deps: [FIREBASE_APP],
    },
  ]);
}
