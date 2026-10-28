import { randomBytes } from 'node:crypto';

const REF_PATTERN = /^ATY-[0-9]{6}-[A-Z0-9]{4}$/;

export function isTransferReference(value: string): boolean {
  return REF_PATTERN.test(value);
}

/** Example: ATY-251028-A3F9 */
export function newTransferReference(now = new Date()): string {
  const y = String(now.getUTCFullYear()).slice(-2);
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const suffix = randomBytes(2).toString('hex').slice(0, 4).toUpperCase();
  return `ATY-${y}${m}${d}-${suffix}`;
}
