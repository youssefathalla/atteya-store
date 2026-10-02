/**
 * Firebase Retry Configuration
 *
 * RxJS retry configuration for Firebase operations with transient errors.
 */

import { throwError, timer } from 'rxjs';

/**
 * Error codes that are safe to retry (transient network issues).
 */
const RETRYABLE_AUTH_CODES = ['auth/network-request-failed', 'auth/requires-recent-login'] as const;

/**
 * RxJS retry configuration for Firebase Auth operations.
 *
 * @example
 * // Use with RxJS retry operator:
 * this.authService.signIn(email, password).pipe(
 *   retry(authRetryConfig)
 * );
 */
export const authRetryConfig = {
  count: 2,
  resetOnSuccess: true,
  delay: (error: { code?: string }) => {
    const isRetryable = RETRYABLE_AUTH_CODES.includes(
      error.code as (typeof RETRYABLE_AUTH_CODES)[number],
    );
    return isRetryable ? timer(500) : throwError(() => error);
  },
};

/**
 * Generic retry configuration for Firestore/Functions operations.
 *
 * @example
 * this.firestore.collection('users').get().pipe(
 *   retry(firestoreRetryConfig)
 * );
 */
export const firestoreRetryConfig = {
  count: 3,
  resetOnSuccess: true,
  delay: (error: { code?: string }) => {
    const retryableCodes = ['unavailable', 'deadline-exceeded', 'aborted'];
    const isRetryable = error.code && retryableCodes.includes(error.code);
    return isRetryable ? timer(1000) : throwError(() => error);
  },
};
