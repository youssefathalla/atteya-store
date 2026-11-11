import { isFirebaseError } from '@shared/utils/firebase/firebase-errors';

function bareFirestoreCode(code: string): string {
  return code.startsWith('firestore/') ? code.slice('firestore/'.length) : code;
}

/**
 * Admin-facing text for a failed orders list load.
 * Keeps the Firestore code/message so a missing or building index is visible
 * instead of a generic "couldn't load" line.
 */
export function orderListError(error: unknown): string {
  if (isFirebaseError(error)) {
    const code = bareFirestoreCode(error.code);
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.trim()
        : '';

    if (code === 'failed-precondition') {
      if (message.length > 0) return message;
      return (
        'This filter needs a database index that is missing or still building. ' +
        'Wait until the orders status + updatedAt index is READY, then refresh.'
      );
    }

    if (message.length > 0 && message.toLowerCase() !== code.toLowerCase()) {
      return `${code}: ${message}`;
    }
    return `Database error (${code}). Try again in a moment.`;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return "We couldn't load orders. Try again in a moment.";
}
