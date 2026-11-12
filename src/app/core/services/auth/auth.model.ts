export const APP_ROLES = ['anon', 'user', 'staff', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type SignedInRole = Exclude<AppRole, 'anon'>;

export type GoogleSignInOutcome = 'popup' | 'redirect' | 'link';

/**
 * Admin or staff only when the ID token claim is exactly `role: 'admin'` / `role: 'staff'`.
 * Staff use the whole dashboard except deleting orders and the Team tab.
 */
export function roleFromClaims(claims: object): SignedInRole {
  if ('role' in claims && (claims.role === 'admin' || claims.role === 'staff')) return claims.role;
  return 'user';
}
