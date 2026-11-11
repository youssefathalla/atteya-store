import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_VERIFICATION_SENDS_PER_STORE_PER_UTC_DAY,
  MAX_VERIFICATION_SENDS_PER_UTC_DAY,
  isTooManyLinkAttempts,
  storeVerificationSendDocId,
  nextVerificationSendCount,
  verificationContinueUrl,
  verificationSendDocId,
} from '../../lib/auth/verification-send.js';
import { renderVerificationEmail } from '../../lib/email/verification-email-template.js';

describe('confirm-your-email send limit', () => {
  it('allows 3 sends per account per day', () => {
    assert.equal(MAX_VERIFICATION_SENDS_PER_UTC_DAY, 3);
    assert.equal(nextVerificationSendCount(undefined), 1);
    assert.equal(nextVerificationSendCount(1), 2);
    assert.equal(nextVerificationSendCount(2), 3);
    assert.equal(nextVerificationSendCount(3), null);
    assert.equal(nextVerificationSendCount(9), null);
  });

  it('treats a broken counter as zero', () => {
    assert.equal(nextVerificationSendCount('2'), 1);
    assert.equal(nextVerificationSendCount(Number.NaN), 1);
    assert.equal(nextVerificationSendCount(-4), 1);
  });

  it('keys the counter by account and UTC day', () => {
    assert.equal(verificationSendDocId('abc', '20261111'), 'abc_20261111');
    assert.equal(storeVerificationSendDocId('20261111'), '__all_20261111');
  });

  it('caps the whole store per day', () => {
    const max = MAX_VERIFICATION_SENDS_PER_STORE_PER_UTC_DAY;
    assert.equal(nextVerificationSendCount(max - 1, max), max);
    assert.equal(nextVerificationSendCount(max, max), null);
  });
});

describe('confirm-your-email link limit from Firebase Auth', () => {
  it('spots TOO_MANY_ATTEMPTS_TRY_LATER inside the SDK internal error', () => {
    const raw =
      'An internal error has occurred. Raw server response: "{"error":{"code":400,"message":"TOO_MANY_ATTEMPTS_TRY_LATER"}}"';
    assert.equal(isTooManyLinkAttempts(new Error(raw)), true);
    assert.equal(isTooManyLinkAttempts({ errorInfo: { message: raw } }), true);
  });

  it('ignores every other failure', () => {
    assert.equal(isTooManyLinkAttempts(new Error('RESEND_API_KEY is not set.')), false);
    assert.equal(isTooManyLinkAttempts(null), false);
    assert.equal(isTooManyLinkAttempts(undefined), false);
  });
});

describe('confirm-your-email return page', () => {
  const site = 'https://shop.example/';

  it('returns to the account page by default', () => {
    assert.equal(verificationContinueUrl(site, undefined), 'https://shop.example/account');
    assert.equal(verificationContinueUrl(site, ''), 'https://shop.example/account');
  });

  it('keeps a plain site path with its query', () => {
    assert.equal(
      verificationContinueUrl(site, '/checkout/confirmation/abc123?key=x_y-Z'),
      'https://shop.example/checkout/confirmation/abc123?key=x_y-Z',
    );
  });

  it('never leaves the site', () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'account', '/a b', 42]) {
      assert.equal(verificationContinueUrl(site, bad), 'https://shop.example/account');
    }
  });

  it('gives no link when the storefront address is not set', () => {
    assert.equal(verificationContinueUrl('  ', '/account'), null);
  });
});

describe('confirm-your-email message', () => {
  const email = renderVerificationEmail({
    storeName: 'Atteya Store',
    link: 'https://auth.example/verify?oobCode=a&b="c"',
  });

  it('has the heading, button and expiry line', () => {
    assert.equal(email.subject, 'Confirm Your Email');
    assert.match(email.html, />Confirm Your Email<\/h1>/);
    assert.match(email.html, />Confirm Email<\/a>/);
    assert.match(email.html, /background:#111111;color:#ffffff;/);
    assert.match(email.html, /expires/);
    assert.match(email.html, /ignore this email/);
    assert.match(email.html, /ATTEYA STORE/);
  });

  it('escapes the link in the HTML and keeps it plain in the text', () => {
    assert.match(email.html, /href="https:\/\/auth\.example\/verify\?oobCode=a&amp;b=&quot;c&quot;"/);
    assert.match(email.text, /Confirm Email: https:\/\/auth\.example\/verify\?oobCode=a&b="c"/);
  });
});
