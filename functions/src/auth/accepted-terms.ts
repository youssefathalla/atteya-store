/**
 * True when a `users/{uid}` profile records accepted terms. The website writes it at
 * signup (email Create account, or the "Almost done" step after a new Google sign-in).
 * The exact version is checked on the website (`CURRENT_TERMS_VERSION`), which asks
 * again when it changes; the server only refuses accounts that never agreed.
 */
export function hasAcceptedTerms(profile: unknown): boolean {
  if (typeof profile !== 'object' || profile === null) return false;
  const { termsVersion, termsAcceptedAt } = profile as Record<string, unknown>;
  return (
    typeof termsVersion === 'string' &&
    termsVersion.length > 0 &&
    termsAcceptedAt !== undefined &&
    termsAcceptedAt !== null
  );
}
