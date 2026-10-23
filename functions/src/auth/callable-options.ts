import { CallableOptions, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineBoolean } from 'firebase-functions/params';

/**
 * Leave false until real reCAPTCHA Enterprise keys are registered per project
 * and written into the Angular environments. Checked at runtime inside
 * requireAppCheck() (called by requireRole) to avoid deploy-time .value() warnings.
 */
export const APP_CHECK_ENFORCED = defineBoolean('APP_CHECK_ENFORCED', {
  default: false,
  description:
    'Reject callable requests that fail App Check. Keep false until reCAPTCHA Enterprise keys exist.',
});

export function adminCallableOptions(
  extra: Partial<CallableOptions> = {},
): CallableOptions {
  return {
    region: 'europe-west3',
    cors: true,
    ...extra,
  };
}

export function requireAppCheck(request: CallableRequest): void {
  if (APP_CHECK_ENFORCED.value() && !request.app) {
    throw new HttpsError(
      'failed-precondition',
      "We couldn't verify this request. Refresh the page and try again.",
    );
  }
}
