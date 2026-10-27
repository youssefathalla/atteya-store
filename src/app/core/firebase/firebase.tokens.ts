import { InjectionToken, inject } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { AppCheck } from 'firebase/app-check';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');
export const FIREBASE_APP_CHECK = new InjectionToken<AppCheck | null>('FIREBASE_APP_CHECK');

export const injectFirebaseApp = (): FirebaseApp => inject(FIREBASE_APP);
export const injectAuth = (): Auth => inject(FIREBASE_AUTH);
export const injectFirestore = (): Firestore => inject(FIRESTORE);
export const injectAppCheck = (): AppCheck | null => inject(FIREBASE_APP_CHECK, { optional: true });
