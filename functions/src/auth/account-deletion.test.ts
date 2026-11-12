import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { signedInRecently } from '../../lib/auth/account-deletion.js';

describe('delete account: recent sign-in', () => {
  const now = Date.UTC(2026, 10, 12, 12, 0, 0);
  const seconds = now / 1000;

  it('accepts a sign-in from the last 10 minutes', () => {
    assert.equal(signedInRecently(seconds - 60, now), true);
    assert.equal(signedInRecently(seconds - 600, now), true);
  });

  it('refuses an older or missing sign-in time', () => {
    assert.equal(signedInRecently(seconds - 601, now), false);
    assert.equal(signedInRecently(undefined, now), false);
    assert.equal(signedInRecently('1', now), false);
  });

  it('refuses a sign-in time far in the future', () => {
    assert.equal(signedInRecently(seconds + 3600, now), false);
  });
});
