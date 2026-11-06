import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAcceptedTerms } from './accepted-terms.ts';

test('a profile with a terms version and acceptance time has agreed', () => {
  assert.equal(
    hasAcceptedTerms({ termsVersion: '2026-10-31-placeholder', termsAcceptedAt: { seconds: 1 } }),
    true,
  );
});

test('no profile has not agreed', () => {
  assert.equal(hasAcceptedTerms(undefined), false);
  assert.equal(hasAcceptedTerms(null), false);
});

test('a profile missing either field has not agreed', () => {
  assert.equal(hasAcceptedTerms({ termsAcceptedAt: { seconds: 1 } }), false);
  assert.equal(hasAcceptedTerms({ termsVersion: '', termsAcceptedAt: { seconds: 1 } }), false);
  assert.equal(hasAcceptedTerms({ termsVersion: 'v1' }), false);
  assert.equal(hasAcceptedTerms({ termsVersion: 'v1', termsAcceptedAt: null }), false);
});
