import { AUTH_ERROR_MAPPINGS, DEFAULT_AUTH_ERROR } from '@core/services/auth/auth.errors';

export interface FirebaseError {
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guard
// ─────────────────────────────────────────────────────────────────────────────

export const isFirebaseError = (err: unknown): err is FirebaseError => {
  return typeof err === 'object' && err !== null && 'code' in err;
};

// ─────────────────────────────────────────────────────────────────────────────
// Error Message Mappings (Direct English)
// ─────────────────────────────────────────────────────────────────────────────

const FIRESTORE_ERROR_MESSAGES: Record<string, string> = {
  'permission-denied': "You don't have permission to perform this action.",
  unavailable: 'The service is temporarily unavailable. Please try again.',
  'not-found': 'The requested item could not be found.',
  aborted: 'The operation was aborted. Please try again.',
  'deadline-exceeded': 'The request took too long. Please try again.',
  'already-exists': 'This item already exists.',
};

const STORAGE_ERROR_MESSAGES: Record<string, string> = {
  'storage/unauthorized': "You don't have permission to access this file.",
  'storage/object-not-found': 'The requested file could not be found.',
  'storage/canceled': 'The upload was cancelled.',
  'storage/quota-exceeded': 'Storage quota exceeded.',
  'storage/retry-limit-exceeded': 'Upload failed after multiple attempts. Please try again.',
};

const FUNCTIONS_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: 'You must be signed in to do that.',
  'permission-denied': "You don't have permission to perform this action.",
  'not-found': 'The requested resource could not be found.',
  'already-exists': 'This resource already exists.',
  'invalid-argument': 'Invalid request. Please check your input.',
  'resource-exhausted': 'Too many requests. Please try again later.',
  cancelled: 'The operation was cancelled.',
  'data-loss': 'Data was lost during the operation.',
  unknown: 'An unknown error occurred.',
  internal: 'An internal server error occurred.',
  unavailable: 'The service is temporarily unavailable. Please try again.',
  'deadline-exceeded': 'The request took too long. Please try again.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapper Functions
// ─────────────────────────────────────────────────────────────────────────────

export const authErrors = (error: FirebaseError): string =>
  AUTH_ERROR_MAPPINGS[error.code] ?? DEFAULT_AUTH_ERROR;

export const firestoreErrors = (error: FirebaseError): string =>
  FIRESTORE_ERROR_MESSAGES[error.code] ?? 'A database error occurred. Please try again.';

export const storageErrors = (error: FirebaseError): string =>
  STORAGE_ERROR_MESSAGES[error.code] ?? 'A storage error occurred. Please try again.';

export const functionsErrors = (error: FirebaseError): string => {
  const code = error.code.replace('functions/', '');
  return FUNCTIONS_ERROR_MESSAGES[code] ?? 'The request failed. Please try again.';
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseErrors = (error: unknown): string => {
  if (!isFirebaseError(error)) {
    return 'Something went wrong. Please try again.';
  }

  if (error.code.startsWith('auth/')) return authErrors(error);
  if (error.code.startsWith('storage/')) return storageErrors(error);
  if (error.code.startsWith('functions/')) return functionsErrors(error);

  return firestoreErrors(error);
};

export const mapFirebaseError = firebaseErrors;
export const handleFirebaseError = firebaseErrors;

// ─────────────────────────────────────────────────────────────────────────────
// Callable (Cloud Functions) messages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Functions SDK ends every callable error message with the HTTP status
 * (`"One item in your bag is out of stock. [400]"`). Exactly one space, then
 * three digits in brackets, so this pattern has no backtracking.
 */
const SDK_HTTP_STATUS_SUFFIX = / \[\d{3}\]$/;

/** True when the message is the SDK's own status text, not one our server wrote. */
function isSdkStatusText(message: string, bareCode: string): boolean {
  const normalized = message.toLowerCase();
  const code = bareCode.toLowerCase();
  return (
    normalized === code ||
    normalized.startsWith(`${code} (`) ||
    normalized.startsWith(`${code}:`) ||
    normalized.startsWith('backend error status:') ||
    normalized.startsWith('unknown backend error status:')
  );
}

/**
 * The plain message a callable's `HttpsError` carried, with the SDK's
 * `[400]`-style status removed. Returns null when the error is not from a
 * callable, or when it holds only the SDK's status text (an uncaught server
 * error, a network failure, a timeout), so the caller shows its own fallback.
 */
export function callableMessage(error: unknown): string | null {
  if (!isFirebaseError(error) || !error.code.startsWith('functions/')) return null;
  const raw = (error as { message?: unknown }).message;
  if (typeof raw !== 'string') return null;
  const message = raw.trim().replace(SDK_HTTP_STATUS_SUFFIX, '').trim();
  if (message.length === 0) return null;
  return isSdkStatusText(message, error.code.slice('functions/'.length)) ? null : message;
}
