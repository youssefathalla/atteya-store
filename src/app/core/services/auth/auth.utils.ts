/** Relative in-app path only. Anything else becomes the storefront home. */
export function safeReturnUrl(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '/';

  const trimmed = value.trim();
  if (!isLocalPath(trimmed)) return '/';

  try {
    const decoded = decodeURIComponent(trimmed);
    if (!isLocalPath(decoded) || decoded.startsWith('/login')) return '/';
  } catch {
    return '/';
  }

  return trimmed;
}

export function authErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = (error as { code: unknown }).code;
  return typeof code === 'string' ? code : '';
}

export function readErrorEmail(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('customData' in error)) return '';
  const customData = (error as { customData?: unknown }).customData;
  if (typeof customData !== 'object' || customData === null || !('email' in customData)) return '';
  const email = (customData as { email?: unknown }).email;
  return typeof email === 'string' ? email : '';
}

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

export function isPopupFallback(error: unknown): boolean {
  return POPUP_FALLBACK_CODES.has(authErrorCode(error));
}

export function isPermissionDenied(error: unknown): boolean {
  const code = authErrorCode(error);
  return code === 'permission-denied' || code.endsWith('/permission-denied');
}

const SESSION_EXPIRED_CODES = new Set([
  'auth/user-token-expired',
  'auth/user-disabled',
  'auth/invalid-user-token',
]);

export function isSessionExpired(error: unknown): boolean {
  return SESSION_EXPIRED_CODES.has(authErrorCode(error));
}

export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at !== trimmed.lastIndexOf('@') || trimmed.includes(' ')) return false;
  const domain = trimmed.slice(at + 1);
  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

function isLocalPath(value: string): boolean {
  return (
    value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') && !value.includes('\\')
  );
}
