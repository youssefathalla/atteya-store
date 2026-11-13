/**
 * `customers/{customerId}` id for an email: SHA-256 (hex) of the trimmed, lower-cased email, the
 * same rule as `customerIdFromEmail()` in `functions/src/customers/customer-summary.ts`. Uses Web
 * Crypto, so it works only in the browser (and on a secure origin).
 */
export async function customerIdForEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || typeof crypto === 'undefined' || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
