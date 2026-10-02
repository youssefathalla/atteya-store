export interface FirebaseError {
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guar
// ─────────────────────────────────────────────────────────────────────────────

export const isFirebaseError = (err: unknown): err is FirebaseError => {
  return typeof err === 'object' && err !== null && 'code' in err;
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Key Mappings (Transloco Keys)
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_ERROR_KEYS: Record<string, string> = {
  'auth/email-already-in-use': 'errors.auth.emailInUse',
  'auth/weak-password': 'errors.auth.weakPassword',
  'auth/invalid-email': 'errors.auth.invalidEmail',
  'auth/user-not-found': 'errors.auth.userNotFound',
  'auth/wrong-password': 'errors.auth.wrongPassword',
  'auth/invalid-credential': 'errors.auth.invalidCredential',
  'auth/network-request-failed': 'errors.auth.networkError',
  'auth/too-many-requests': 'errors.auth.tooManyRequests',
  'auth/operation-not-allowed': 'errors.auth.operationNotAllowed',
  'auth/requires-recent-login': 'errors.auth.requiresRecentLogin',
  'auth/user-disabled': 'errors.auth.userDisabled',
  'auth/popup-closed-by-user': 'errors.auth.popupClosed',
};

const FIRESTORE_ERROR_KEYS: Record<string, string> = {
  'permission-denied': 'errors.firestore.permissionDenied',
  unavailable: 'errors.firestore.unavailable',
  'not-found': 'errors.firestore.notFound',
  aborted: 'errors.firestore.aborted',
  'deadline-exceeded': 'errors.firestore.deadlineExceeded',
  'already-exists': 'errors.firestore.alreadyExists',
};

const STORAGE_ERROR_KEYS: Record<string, string> = {
  'storage/unauthorized': 'errors.storage.unauthorized',
  'storage/object-not-found': 'errors.storage.objectNotFound',
  'storage/canceled': 'errors.storage.canceled',
  'storage/quota-exceeded': 'errors.storage.quotaExceeded',
  'storage/retry-limit-exceeded': 'errors.storage.retryLimitExceeded',
};

const FUNCTIONS_ERROR_KEYS: Record<string, string> = {
  unauthenticated: 'errors.functions.unauthenticated',
  'permission-denied': 'errors.functions.permissionDenied',
  'not-found': 'errors.functions.notFound',
  'already-exists': 'errors.functions.alreadyExists',
  'invalid-argument': 'errors.functions.invalidArgument',
  'resource-exhausted': 'errors.functions.resourceExhausted',
  cancelled: 'errors.functions.cancelled',
  'data-loss': 'errors.functions.dataLoss',
  unknown: 'errors.functions.unknown',
  internal: 'errors.functions.internal',
  unavailable: 'errors.functions.unavailable',
  'deadline-exceeded': 'errors.functions.deadlineExceeded',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapper Functions (Return Transloco Keys)
// ─────────────────────────────────────────────────────────────────────────────

export const authErrors = (error: FirebaseError): string =>
  AUTH_ERROR_KEYS[error.code] ?? 'errors.auth.default';

export const firestoreErrors = (error: FirebaseError): string =>
  FIRESTORE_ERROR_KEYS[error.code] ?? 'errors.firestore.default';

export const storageErrors = (error: FirebaseError): string =>
  STORAGE_ERROR_KEYS[error.code] ?? 'errors.storage.default';

export const functionsErrors = (error: FirebaseError): string => {
  const code = error.code.replace('functions/', '');
  return FUNCTIONS_ERROR_KEYS[code] ?? 'errors.functions.default';
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Dispatcher (Returns Transloco Key)
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseErrors = (error: unknown): string => {
  if (!isFirebaseError(error)) {
    // This is a pure mapping function with no injection context, so it can't use
    // LoggerService directly. Callers are expected to log the raw error themselves
    // before/after mapping it to a display key.
    return 'errors.generic';
  }

  if (error.code.startsWith('auth/')) return authErrors(error);

  if (error.code.startsWith('storage/')) return storageErrors(error);

  if (error.code.startsWith('functions/')) return functionsErrors(error);

  return firestoreErrors(error);
};

export const mapFirebaseError = firebaseErrors;

