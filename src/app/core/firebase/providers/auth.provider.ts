import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { getAuth, Auth } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_AUTH } from '../firebase.tokens';

export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_AUTH,
      useFactory: (app: FirebaseApp): Auth => getAuth(app),
      deps: [FIREBASE_APP],
    },
  ]);
}
