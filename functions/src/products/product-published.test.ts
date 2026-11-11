import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  publishBlockedReason,
  readSetProductPublishedRequest,
} from '../../lib/products/product-published.js';

describe('readSetProductPublishedRequest', () => {
  it('reads a product id and the new state', () => {
    assert.deepEqual(readSetProductPublishedRequest({ productId: 'abc', published: true }), {
      productId: 'abc',
      published: true,
    });
  });

  it('refuses a missing or unsafe product id', () => {
    assert.equal(typeof readSetProductPublishedRequest({ published: true }), 'string');
    assert.equal(typeof readSetProductPublishedRequest({ productId: 'a/b', published: true }), 'string');
    assert.equal(typeof readSetProductPublishedRequest(null), 'string');
  });

  it('refuses a state that is not true or false', () => {
    assert.equal(
      readSetProductPublishedRequest({ productId: 'abc', published: 'yes' }),
      'Choose whether to show this product on the store.',
    );
  });
});

describe('publishBlockedReason', () => {
  it('lets a product with a photo go live', () => {
    assert.equal(publishBlockedReason(true, [{ path: 'products/a/1.jpg' }]), null);
  });

  it('stops a product without photos from going live', () => {
    assert.equal(publishBlockedReason(true, []), 'Add at least one photo before showing it on the store.');
    assert.equal(
      publishBlockedReason(true, undefined),
      'Add at least one photo before showing it on the store.',
    );
  });

  it('always allows hiding', () => {
    assert.equal(publishBlockedReason(false, []), null);
  });
});
