/**
 * Same comparison as Firebase Auth `checkRevoked`: a session is revoked when
 * its `auth_time` (milliseconds) is strictly older than `tokensValidAfterTime`.
 * An equal timestamp is still valid. A missing revocation time means the
 * account has never had its refresh tokens revoked.
 */
export function isRevokedSession(
  authTimeSeconds: number | undefined,
  tokensValidAfterTime: string | undefined,
): boolean {
  if (!tokensValidAfterTime) return false;
  const validSinceMs = Date.parse(tokensValidAfterTime);
  if (!Number.isFinite(validSinceMs)) return true;
  if (typeof authTimeSeconds !== 'number' || !Number.isFinite(authTimeSeconds)) return true;
  return authTimeSeconds * 1000 < validSinceMs;
}

/** Milliseconds to store in `roles/{uid}.revokeTimeMs` for security rules. */
export function revokeTimeMs(tokensValidAfterTime: string | undefined): number {
  const parsed = Date.parse(tokensValidAfterTime ?? '');
  if (!Number.isFinite(parsed)) {
    throw new Error('Auth did not return a revocation time.');
  }
  return parsed;
}
