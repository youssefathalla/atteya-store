import { connectAuthEmulator, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { connectFunctionsEmulator, Functions } from 'firebase/functions';

export const EMULATOR_HOST = '127.0.0.1';

export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
} as const;

export function connectAuth(auth: Auth): void {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  });
}

export function connectFirestore(firestore: Firestore): void {
  connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORTS.firestore);
}

export function connectStorage(storage: FirebaseStorage): void {
  connectStorageEmulator(storage, EMULATOR_HOST, EMULATOR_PORTS.storage);
}

export function connectFunctions(functions: Functions): void {
  connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
}
