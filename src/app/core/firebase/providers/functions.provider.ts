import { EnvironmentProviders, makeEnvironmentProviders, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getFunctions, Functions } from 'firebase/functions';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_FUNCTIONS } from '../firebase.tokens';
import { connectFunctions } from '../firebase-emulators';

export interface FunctionsOptions {
  regionOrCustomDomain?: string;
  useEmulator?: boolean;
}

export function provideFunctions(options?: FunctionsOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_FUNCTIONS,
      useFactory: (app: FirebaseApp, platformId: object): Functions => {
        const functions = options?.regionOrCustomDomain
          ? getFunctions(app, options.regionOrCustomDomain)
          : getFunctions(app);

        if (options?.useEmulator && isPlatformBrowser(platformId)) {
          connectFunctions(functions);
        }
        return functions;
      },
      deps: [FIREBASE_APP, PLATFORM_ID],
    },
  ]);
}
