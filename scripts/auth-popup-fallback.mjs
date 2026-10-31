/**
 * Contract: Google popup sign-in falls back to redirect on transport failures, not user cancel.
 * Used by preflight and runnable as `node scripts/auth-popup-fallback.mjs`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AUTH_UTILS_REL = 'src/app/core/services/auth/auth.utils.ts';

const REQUIRED_FALLBACK_CODES = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/network-request-failed',
  'auth/timeout',
];

const MUST_NOT_FALLBACK_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

/**
 * @param {string} source auth.utils.ts contents
 */
export function parsePopupFallbackCodes(source) {
  const match = source.match(/const POPUP_FALLBACK_CODES = new Set\(\[([\s\S]*?)\]\)/);
  if (!match) {
    throw new Error('Could not find POPUP_FALLBACK_CODES in auth.utils.ts.');
  }
  const codes = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (codes.length === 0) {
    throw new Error('POPUP_FALLBACK_CODES is empty.');
  }
  return new Set(codes);
}

export function authErrorCode(error) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = error.code;
  return typeof code === 'string' ? code : '';
}

/**
 * @param {unknown} error
 * @param {Set<string>} fallbackCodes
 */
export function isPopupFallback(error, fallbackCodes) {
  return fallbackCodes.has(authErrorCode(error));
}

export function assertAuthPopupFallbackHelper() {
  for (const code of REQUIRED_FALLBACK_CODES) {
    const error = { code };
    if (!isPopupFallback(error, new Set(REQUIRED_FALLBACK_CODES))) {
      throw new Error(`Expected ${code} to trigger popup→redirect fallback.`);
    }
  }
  for (const code of MUST_NOT_FALLBACK_CODES) {
    const error = { code };
    if (isPopupFallback(error, new Set(REQUIRED_FALLBACK_CODES))) {
      throw new Error(`${code} must not trigger popup→redirect fallback.`);
    }
  }
}

export function assertAuthPopupFallbackContract(cwd = process.cwd()) {
  assertAuthPopupFallbackHelper();

  const file = path.resolve(cwd, AUTH_UTILS_REL);
  const source = fs.readFileSync(file, 'utf8');
  const codes = parsePopupFallbackCodes(source);

  for (const required of REQUIRED_FALLBACK_CODES) {
    if (!codes.has(required)) {
      throw new Error(`${path.relative(cwd, file)}: POPUP_FALLBACK_CODES missing ${required}.`);
    }
  }
  for (const forbidden of MUST_NOT_FALLBACK_CODES) {
    if (codes.has(forbidden)) {
      throw new Error(`${path.relative(cwd, file)}: POPUP_FALLBACK_CODES must not include ${forbidden}.`);
    }
  }

  return file;
}

const isDirectRun =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    assertAuthPopupFallbackContract();
    console.log('[auth-popup-fallback] ok: transport errors redirect; user cancel does not.');
  } catch (error) {
    console.error(`[auth-popup-fallback] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
