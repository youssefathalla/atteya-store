import { callableMessage, firebaseErrors, isFirebaseError } from '@shared/utils/firebase/firebase-errors';

/** Prefer the callable's plain-language message when Firebase wraps it. */
export function orderActionError(error: unknown): string {
  const message = callableMessage(error);
  if (message) return message;
  if (isFirebaseError(error) && error.code.startsWith('functions/')) {
    const code = error.code;
    if (code === 'functions/internal' || code === 'functions/unknown' || code === 'functions/unavailable') {
      return 'That did not work. Please try again.';
    }
    return firebaseErrors(error);
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return firebaseErrors(error);
}
