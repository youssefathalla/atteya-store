import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parcelWeight, planDelivery, type ParcelLine, type ShippingBox } from './shipping.js';

/** Client's Egypt rates (Nov 2026): up to 1 kg = 115, up to 3 kg = 135, heavier = agreed. */
const EGYPT: readonly ShippingBox[] = [
  {
    id: 'box1',
    name: 'Box 1',
    maxWeightGrams: 1_000,
    maxLengthCm: 30,
    maxWidthCm: 20,
    maxHeightCm: 10,
    feeEgp: 115,
  },
  {
    id: 'box2',
    name: 'Box 2',
    maxWeightGrams: 3_000,
    maxLengthCm: 45,
    maxWidthCm: 35,
    maxHeightCm: 20,
    feeEgp: 135,
  },
];

const TEE = 250;
const SHORTS = 250;
const HOODIE = 800;
const SOCKS = 0;

function fee(lines: readonly ParcelLine[], region: 'egypt' | 'international' = 'egypt'): number | string {
  const plan = planDelivery(EGYPT, region, parcelWeight(lines));
  return plan.kind === 'box' ? plan.box.feeEgp : plan.kind;
}

describe('client shipping examples (Egypt)', () => {
  it('4 t-shirts = 1 kg = 115', () => {
    assert.equal(fee([{ weightGrams: TEE, quantity: 4 }]), 115);
  });

  it('5 to 10 pieces (over 1 kg, up to 3 kg) = 135', () => {
    assert.equal(fee([{ weightGrams: TEE, quantity: 5 }]), 135);
    assert.equal(
      fee([
        { weightGrams: TEE, quantity: 6 },
        { weightGrams: SHORTS, quantity: 4 },
      ]),
      135,
    );
  });

  it('a hoodie alone = 115; a hoodie with a t-shirt = 135', () => {
    assert.equal(fee([{ weightGrams: HOODIE, quantity: 1 }]), 115);
    assert.equal(
      fee([
        { weightGrams: HOODIE, quantity: 1 },
        { weightGrams: TEE, quantity: 1 },
      ]),
      135,
    );
  });

  it('socks never add weight, and socks alone still pay 115', () => {
    assert.equal(fee([{ weightGrams: SOCKS, quantity: 3 }]), 115);
    assert.equal(
      fee([
        { weightGrams: TEE, quantity: 4 },
        { weightGrams: SOCKS, quantity: 6 },
      ]),
      115,
    );
  });

  it('over 3 kg: the fee is agreed with the customer', () => {
    assert.equal(fee([{ weightGrams: TEE, quantity: 13 }]), 'to-be-agreed');
    assert.equal(fee([{ weightGrams: HOODIE, quantity: 4 }]), 'to-be-agreed');
  });

  it('a product without a weight counts as 500 g per unit', () => {
    assert.equal(parcelWeight([{ weightGrams: null, quantity: 2 }]).totalWeightGrams, 1_000);
    assert.equal(parcelWeight([{ weightGrams: null, quantity: 1 }]).anyWeightMissing, true);
    assert.equal(fee([{ weightGrams: null, quantity: 2 }]), 115);
    assert.equal(
      fee([
        { weightGrams: null, quantity: 1 },
        { weightGrams: TEE, quantity: 3 },
      ]),
      135,
    );
    assert.equal(fee([{ weightGrams: null, quantity: 6 }]), 135);
    assert.equal(fee([{ weightGrams: null, quantity: 7 }]), 'to-be-agreed');
    assert.equal(
      fee([
        { weightGrams: null, quantity: 1 },
        { weightGrams: HOODIE, quantity: 4 },
      ]),
      'to-be-agreed',
    );
  });

  it('abroad, too heavy cannot be ordered', () => {
    assert.equal(fee([{ weightGrams: HOODIE, quantity: 4 }], 'international'), 'too-heavy');
  });

  it('with no boxes delivery is unavailable', () => {
    assert.equal(planDelivery([], 'egypt', parcelWeight([])).kind, 'unavailable');
  });
});
