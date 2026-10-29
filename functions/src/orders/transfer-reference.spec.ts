import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTransferReference, newTransferReference } from './transfer-reference.js';

describe('transfer-reference', () => {
  it('minted refs match the ATY-YYMMDD-XXXXXXXX pattern', () => {
    const ref = newTransferReference(new Date('2026-10-28T12:00:00Z'));
    assert.equal(ref.slice(0, 11), 'ATY-261028-');
    assert.equal(ref.length, 19);
    assert.equal(isTransferReference(ref), true);
  });

  it('rejects the old 4-char suffix namespace', () => {
    assert.equal(isTransferReference('ATY-261028-A3F9'), false);
  });
});
