import { EnvironmentProviders, makeEnvironmentProviders, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import type { FirebaseApp } from 'firebase/app';
import { FIREBASE_APP, FIREBASE_STORAGE } from '../firebase.tokens';
import { connectStorage } from '../firebase-emulators';

export interface StorageOptions {
  bucketUrl?: string;
  useEmulator?: boolean;
}

export function provideStorage(options?: StorageOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_STORAGE,
      useFactory: (app: FirebaseApp, platformId: object): FirebaseStorage => {
        const storage = options?.bucketUrl ? getStorage(app, options.bucketUrl) : getStorage(app);

        if (options?.useEmulator && isPlatformBrowser(platformId)) {
          connectStorage(storage);
        }
        return storage;
      },
      deps: [FIREBASE_APP, PLATFORM_ID],
    },
  ]);
}
