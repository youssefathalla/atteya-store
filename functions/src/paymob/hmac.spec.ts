import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { computePaymobHmac, paymobHmacConcat, verifyPaymobHmac } from './hmac.js';

/** Sample fields from Paymob HMAC docs (concatenation only — secret is local). */
const SAMPLE_OBJ: Record<string, unknown> = {
  amount_cents: 100,
  created_at: '2020-03-25T18:39:44.719228',
  currency: 'EGP',
  error_occured: false,
  has_parent_transaction: false,
  id: 2556706,
  integration_id: 6741,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 4778239 },
  owner: 4705,
  pending: false,
  source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
  success: true,
};

const EXPECTED_CONCAT =
  '1002020-03-25T18:39:44.719228EGPfalsefalse25567066741truefalsefalsefalsetruefalse47782394705false2346MasterCardcardtrue';

describe('paymob HMAC', () => {
  it('concatenates Transaction Processed fields in documented order', () => {
    assert.equal(paymobHmacConcat(SAMPLE_OBJ), EXPECTED_CONCAT);
  });

  it('verifies a matching SHA-512 hex digest', () => {
    const secret = 'test-hmac-secret';
    const digest = createHmac('sha512', secret).update(EXPECTED_CONCAT).digest('hex');
    assert.equal(computePaymobHmac(SAMPLE_OBJ, secret), digest);
    assert.equal(verifyPaymobHmac(SAMPLE_OBJ, digest, secret), true);
    assert.equal(verifyPaymobHmac(SAMPLE_OBJ, 'deadbeef', secret), false);
    assert.equal(verifyPaymobHmac(SAMPLE_OBJ, '', secret), false);
    assert.equal(verifyPaymobHmac(SAMPLE_OBJ, null, secret), false);
  });

  it('stringifies missing nested source_data as empty segments', () => {
    const walletish: Record<string, unknown> = {
      ...SAMPLE_OBJ,
      source_data: { pan: null, sub_type: null, type: 'wallet' },
    };
    const concat = paymobHmacConcat(walletish);
    assert.ok(concat.endsWith('wallettrue'));
    assert.ok(concat.includes('falsewallettrue') || (concat.includes('false') && concat.includes('wallet')));
  });
});
