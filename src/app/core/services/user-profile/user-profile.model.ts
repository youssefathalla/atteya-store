import type * as v from 'valibot';
import type { UserProfileSchema } from './user-profile.schema';

export type UserProfile = v.InferOutput<typeof UserProfileSchema>;

export const USERS_COLLECTION = 'users';

/**
 * Bump when the live Terms / Privacy text changes.
 * Placeholder until Youssef supplies client legal copy.
 */
export const CURRENT_TERMS_VERSION = '2026-10-31-placeholder';

export interface SignupConsent {
  readonly termsAccepted: boolean;
  readonly marketingOptIn: boolean;
}
