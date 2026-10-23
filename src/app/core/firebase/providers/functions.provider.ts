import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { getFunctions, Functions } from 'firebase/functions';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_FUNCTIONS } from '../firebase.tokens';

export interface FunctionsOptions {
  regionOrCustomDomain?: string;
}

export function provideFunctions(options?: FunctionsOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_FUNCTIONS,
      useFactory: (app: FirebaseApp): Functions =>
        options?.regionOrCustomDomain ? getFunctions(app, options.regionOrCustomDomain) : getFunctions(app),
      deps: [FIREBASE_APP],
    },
  ]);
}
