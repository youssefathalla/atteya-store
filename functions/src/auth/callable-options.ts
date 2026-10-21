import { CallableOptions } from 'firebase-functions/v2/https';
import { defineBoolean } from 'firebase-functions/params';

/**
 * Leave false until real reCAPTCHA Enterprise keys are registered per project
 * and written into the Angular environments. The role check is the protection
 * until then.
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
    // firebase-functions 6 types accept a boolean here, not a param expression.
    // The value is fixed when the container loads. Unset or anything other than
    // the string "true" stays off.
    enforceAppCheck: APP_CHECK_ENFORCED.value(),
    ...extra,
  };
}
