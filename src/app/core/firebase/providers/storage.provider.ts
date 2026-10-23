import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_STORAGE } from '../firebase.tokens';

export interface StorageOptions {
  bucketUrl?: string;
}

export function provideStorage(options?: StorageOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_STORAGE,
      useFactory: (app: FirebaseApp): FirebaseStorage =>
        options?.bucketUrl ? getStorage(app, options.bucketUrl) : getStorage(app),
      deps: [FIREBASE_APP],
    },
  ]);
}
