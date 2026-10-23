/**
 * Firebase Authentication error codes in everyday language.
 * Keep these aligned with `authErrors()` in `shared/utils/firebase/firebase-errors.ts`.
 */
export const AUTH_ERROR_MAPPINGS: Record<string, string> = {
  'auth/user-not-found': "We couldn't find an account with that email.",
  'auth/wrong-password': 'That password is incorrect. Try again, or reset it.',
  'auth/invalid-credential':
    "That email or password doesn't match. Try again, or reset your password.",
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Use at least 8 characters.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account is turned off. Contact the store if you still need access.',
  'auth/too-many-requests': 'Too many attempts. Wait a little, then try again.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
  'auth/popup-blocked': 'The Google window was blocked. Allow pop-ups for this site and try again.',
  'auth/cancelled-popup-request': 'Google sign-in was cancelled. Try again when you are ready.',
  'auth/account-exists-with-different-credential':
    'This email already has a password. Enter it to connect Google to the same account.',
  'auth/credential-already-in-use': 'That Google account is already connected to a different sign-in.',
  'auth/provider-already-linked': 'Google is already connected to this account.',
  'auth/admin-restricted-operation': 'Sign-up is by invitation only.',
  'auth/unauthorized-domain':
    'This website is not allowed to sign people in yet. Open the store from its usual address and try again.',
  'auth/network-request-failed': 'We could not reach sign-in. Check your connection and try again.',
  'auth/requires-recent-login': 'Please sign in again to continue.',
  'auth/operation-not-allowed': 'This sign-in method is not available right now.',
};

/** Shown when Firebase returns an authentication code we do not recognise. */
export const DEFAULT_AUTH_ERROR = 'Something went wrong signing you in. Please try again.';
