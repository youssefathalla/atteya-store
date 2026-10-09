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

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

/**
 * Retries an idempotent async Promise operation with exponential backoff.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 500, backoffFactor = 2 } = options;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= backoffFactor;
    }
  }
  throw new Error('Retry limit reached');
}

