import { firebaseErrors } from '@shared/utils/firebase/firebase-errors';

function isSdkStatusMessage(message: string, bareCode: string): boolean {
  const normalized = message.trim().toLowerCase();
  const code = bareCode.toLowerCase();
  return normalized === code || normalized.startsWith(`${code} (`) || normalized.startsWith(`${code}:`);
}

export function importActionError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && 'code' in error) {
    const message = (error as { message?: unknown }).message;
    const code = (error as { code?: unknown }).code;
    if (typeof message === 'string' && typeof code === 'string' && code.startsWith('functions/')) {
      const bareCode = code.slice('functions/'.length);
      if (message.length > 0 && !isSdkStatusMessage(message, bareCode)) return message;
      if (bareCode === 'internal' || bareCode === 'unknown' || bareCode === 'unavailable') {
        return 'That did not work. Please try again.';
      }
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return firebaseErrors(error);
}
