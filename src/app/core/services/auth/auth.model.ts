export const APP_ROLES = ['anon', 'user', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type SignedInRole = Exclude<AppRole, 'anon'>;

export type GoogleSignInOutcome = 'popup' | 'redirect' | 'link';

/** Admin only when the ID token claim is exactly `role: 'admin'`. */
export function roleFromClaims(claims: object): SignedInRole {
  if ('role' in claims && claims.role === 'admin') return 'admin';
  return 'user';
}
