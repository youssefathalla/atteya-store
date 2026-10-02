import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { FIREBASE_APP } from '../firebase.tokens';

export function provideFirebaseApp(options: FirebaseOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP,
      useFactory: (): FirebaseApp => {
        return getApps().length === 0 ? initializeApp(options) : getApp();
      },
    },
  ]);
}
