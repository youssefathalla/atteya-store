import { randomBytes } from 'node:crypto';

/** ATY-YYMMDD- + 8 hex chars ≈ 4.3e9 values per UTC day. */
const REF_PATTERN = /^ATY-[0-9]{6}-[A-F0-9]{8}$/;

export function isTransferReference(value: string): boolean {
  return REF_PATTERN.test(value);
}

/** Example: ATY-251028-A3F9B2C1 */
export function newTransferReference(now = new Date()): string {
  const y = String(now.getUTCFullYear()).slice(-2);
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  return `ATY-${y}${m}${d}-${suffix}`;
}
