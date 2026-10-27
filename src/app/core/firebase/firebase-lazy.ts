import { inject } from '@angular/core';
import type { FirebaseStorage } from 'firebase/storage';
import type { Functions, HttpsCallable, HttpsCallableOptions } from 'firebase/functions';
import { FIREBASE_APP } from './firebase.tokens';

/** Cloud Functions region for every store callable. */
const FUNCTIONS_REGION = 'europe-west3';

let storagePromise: Promise<FirebaseStorage> | undefined;
let functionsPromise: Promise<Functions> | undefined;

/**
 * Loads `firebase/storage` on first use. Call from an injection context
 * (a constructor or field initializer) and await the promise later.
 */
export function injectStorageAsync(): Promise<FirebaseStorage> {
  const app = inject(FIREBASE_APP);
  storagePromise ??= import('firebase/storage')
    .then(({ getStorage }) => getStorage(app))
    .catch((error: unknown) => {
      storagePromise = undefined;
      throw error;
    });
  return storagePromise;
}

/**
 * Loads `firebase/functions` on first use, pointed at `europe-west3`.
 * Call from an injection context and await the promise later.
 */
export function injectFunctionsAsync(): Promise<Functions> {
  const app = inject(FIREBASE_APP);
  functionsPromise ??= import('firebase/functions')
    .then(({ getFunctions }) => getFunctions(app, FUNCTIONS_REGION))
    .catch((error: unknown) => {
      functionsPromise = undefined;
      throw error;
    });
  return functionsPromise;
}

/** Builds a callable after the Functions SDK has loaded. */
export async function callableFrom<Request, Response>(
  functions: Promise<Functions>,
  name: string,
  options?: HttpsCallableOptions,
): Promise<HttpsCallable<Request, Response>> {
  const [{ httpsCallable }, resolved] = await Promise.all([import('firebase/functions'), functions]);
  return httpsCallable<Request, Response>(resolved, name, options);
}
