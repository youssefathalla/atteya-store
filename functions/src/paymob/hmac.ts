import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Paymob Transaction Processed callback HMAC field order
 * (developers.paymob.com → HMAC transaction callback).
 */
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

/** Builds the concatenation string Paymob signs for a processed transaction. */
export function paymobHmacConcat(obj: Record<string, unknown>): string {
  return HMAC_FIELDS.map((path) => stringifyHmacValue(readPath(obj, path))).join('');
}

export function computePaymobHmac(obj: Record<string, unknown>, secret: string): string {
  return createHmac('sha512', secret).update(paymobHmacConcat(obj)).digest('hex');
}

/**
 * Constant-time compare of the query `hmac` against a freshly computed digest.
 * Missing / wrong-length values are treated as a mismatch.
 */
export function verifyPaymobHmac(
  obj: Record<string, unknown>,
  providedHmac: string | null | undefined,
  secret: string,
): boolean {
  if (typeof providedHmac !== 'string' || providedHmac.length === 0) return false;
  const expected = computePaymobHmac(obj, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedHmac.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return obj[path];
  const [head, ...rest] = path.split('.');
  const nested = obj[head!];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return undefined;
  let cur: unknown = nested;
  for (const key of rest) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Stringify for HMAC. Booleans → "true"/"false"; null/undefined → ""
 * (empty string matches Paymob wallet callbacks better than the word "null").
 */
function stringifyHmacValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}
