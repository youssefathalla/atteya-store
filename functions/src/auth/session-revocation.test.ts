import assert from 'node:assert/strict';
import test from 'node:test';
import { isRevokedSession, revokeTimeMs } from './session-revocation.ts';

const REVOKED_AT = '2026-10-23T11:22:00.500Z';
const REVOKED_MS = Date.parse(REVOKED_AT);

test('a session that started before revocation is rejected', () => {
  const authTimeSeconds = Math.floor((REVOKED_MS - 1) / 1000);
  assert.equal(isRevokedSession(authTimeSeconds, REVOKED_AT), true);
});

test('a session that started at the same millisecond is still valid', () => {
  assert.equal(isRevokedSession(REVOKED_MS / 1000, REVOKED_AT), false);
});

test('a sign-in after revocation is valid', () => {
  const authTimeSeconds = Math.floor(REVOKED_MS / 1000) + 1;
  assert.equal(isRevokedSession(authTimeSeconds, REVOKED_AT), false);
});

test('accounts that were never revoked stay valid', () => {
  assert.equal(isRevokedSession(1_700_000_000, undefined), false);
});

test('a missing or unreadable sign-in time fails closed once tokens were revoked', () => {
  assert.equal(isRevokedSession(undefined, REVOKED_AT), true);
  assert.equal(isRevokedSession(Number.NaN, REVOKED_AT), true);
  assert.equal(isRevokedSession(1_700_000_000, 'not-a-time'), true);
});

test('rules store the same millisecond timestamp Auth returns', () => {
  assert.equal(revokeTimeMs(REVOKED_AT), REVOKED_MS);
  assert.throws(() => revokeTimeMs(undefined));
});
