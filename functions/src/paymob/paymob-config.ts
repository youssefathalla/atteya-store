import { defineSecret, defineString } from 'firebase-functions/params';

/** Egypt Accept API origin. Test and live share the host; keys pick the mode. */
export const PAYMOB_BASE_URL = defineString('PAYMOB_BASE_URL', {
  default: 'https://accept.paymob.com',
  description: 'Paymob regional API origin (Egypt: https://accept.paymob.com).',
});

/**
 * Public key used only to build the Unified Checkout redirect URL.
 * Safe to expose to the browser; still kept as a Functions param so it is
 * not committed in Angular environments.
 */
export const PAYMOB_PUBLIC_KEY = defineString('PAYMOB_PUBLIC_KEY', {
  default: '',
  description: 'Paymob Public Key (pk_test_… / pk_live_…).',
});

/**
 * Comma-separated Integration IDs (card, wallet, …). Must match the
 * Secret Key's Test/Live mode. Dashboard → Settings → Payment Integrations.
 */
export const PAYMOB_INTEGRATION_IDS = defineString('PAYMOB_INTEGRATION_IDS', {
  default: '',
  description: 'Comma-separated Paymob Integration IDs for Intention payment_methods.',
});

/**
 * Storefront origin for Paymob redirection_url after card/wallet checkout.
 * Example: https://www.atteyastore.com or https://…hosted.app
 */
export const STOREFRONT_URL = defineString('STOREFRONT_URL', {
  default: '',
  description: 'Public storefront origin (no trailing slash) for Paymob return redirects.',
});

/**
 * Absolute HTTPS URL of the paymobWebhook Cloud Function.
 * Must be reachable by Paymob (not localhost). Set after the first functions deploy.
 */
export const PAYMOB_NOTIFICATION_URL = defineString('PAYMOB_NOTIFICATION_URL', {
  default: '',
  description: 'Public HTTPS URL of paymobWebhook (notification_url).',
});

/** Intention API auth. Never commit; store in Secret Manager. */
export const PAYMOB_SECRET_KEY = defineSecret('PAYMOB_SECRET_KEY');

/** Transaction callback HMAC. Never commit; store in Secret Manager. */
export const PAYMOB_HMAC_SECRET = defineSecret('PAYMOB_HMAC_SECRET');

export function paymobSecrets() {
  return [PAYMOB_SECRET_KEY, PAYMOB_HMAC_SECRET] as const;
}

export function readPaymobIntegrationIds(): number[] {
  const raw = PAYMOB_INTEGRATION_IDS.value().trim();
  if (!raw) return [];
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) ids.push(n);
  }
  return ids;
}

export function requireConfiguredPaymob(): {
  readonly baseUrl: string;
  readonly publicKey: string;
  readonly secretKey: string;
  readonly integrationIds: number[];
  readonly storefrontUrl: string;
  readonly notificationUrl: string;
} {
  const baseUrl = PAYMOB_BASE_URL.value().replace(/\/+$/, '');
  const publicKey = PAYMOB_PUBLIC_KEY.value().trim();
  const secretKey = PAYMOB_SECRET_KEY.value().trim();
  const integrationIds = readPaymobIntegrationIds();
  const storefrontUrl = STOREFRONT_URL.value().replace(/\/+$/, '');
  const notificationUrl = PAYMOB_NOTIFICATION_URL.value().trim();

  if (!publicKey || !secretKey || integrationIds.length === 0) {
    throw new Error('Paymob is not configured. Set public key, secret key, and integration IDs.');
  }
  if (!storefrontUrl.startsWith('https://') && !storefrontUrl.startsWith('http://localhost')) {
    throw new Error('STOREFRONT_URL must be a public storefront origin.');
  }
  if (!notificationUrl.startsWith('https://')) {
    throw new Error('PAYMOB_NOTIFICATION_URL must be a public HTTPS webhook URL.');
  }

  return { baseUrl, publicKey, secretKey, integrationIds, storefrontUrl, notificationUrl };
}
