import { signal, DestroyRef, inject, Signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  DocumentReference,
  Query,
  onSnapshot,
  FirestoreError,
} from 'firebase/firestore';

export interface SignalDocOptions {
  onError?: (error: FirestoreError) => void;
}

/**
 * Binds a Firestore DocumentReference to an Angular Signal.
 * - undefined: Loading / fetching
 * - null: Document does not exist
 * - T: Document data
 * Automatically unsubscribes on component destruction. SSR-safe.
 */
export function signalDoc<T>(
  docRef: DocumentReference<T>,
  options?: SignalDocOptions,
): Signal<T | null | undefined> {
  const data = signal<T | null | undefined>(undefined);
  const platformId = inject(PLATFORM_ID);
  const destroyRef = inject(DestroyRef);

  if (isPlatformBrowser(platformId)) {
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        data.set(snapshot.exists() ? snapshot.data() : null);
      },
      (error) => {
        options?.onError?.(error);
        data.set(null);
      },
    );

    destroyRef.onDestroy(unsubscribe);
  } else {
    // In SSR, leave as undefined or null to prevent hanging WebSockets
    data.set(null);
  }

  return data.asReadonly();
}

/**
 * Binds a Firestore Query to an Angular Signal.
 * - undefined: Loading / fetching
 * - T[]: List of document data
 * Automatically unsubscribes on component destruction. SSR-safe.
 */
export function signalCollection<T>(
  query: Query<T>,
  options?: SignalDocOptions,
): Signal<T[] | undefined> {
  const data = signal<T[] | undefined>(undefined);
  const platformId = inject(PLATFORM_ID);
  const destroyRef = inject(DestroyRef);

  if (isPlatformBrowser(platformId)) {
    const unsubscribe = onSnapshot(
      query,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => doc.data());
        data.set(items);
      },
      (error) => {
        options?.onError?.(error);
        data.set([]);
      },
    );

    destroyRef.onDestroy(unsubscribe);
  } else {
    data.set([]);
  }

  return data.asReadonly();
}
