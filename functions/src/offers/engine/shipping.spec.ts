import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parcelWeight,
  planDelivery,
  shippingQuote,
  type ParcelLine,
  type ShippingBox,
  type ShippingSettings,
} from './shipping.js';
import type { Offer, PricedProduct, PricingContext } from './types.js';

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

/** International boxes (placeholder rates): one box, far dearer than Egypt. */
const ABROAD: readonly ShippingBox[] = [
  {
    id: 'box1',
    name: 'Box 1',
    maxWeightGrams: 2_000,
    maxLengthCm: 40,
    maxWidthCm: 30,
    maxHeightCm: 15,
    feeEgp: 1_800,
  },
];

const SETTINGS: ShippingSettings = {
  currency: 'EGP',
  egyptBoxes: EGYPT,
  internationalBoxes: ABROAD,
  freeOver: { active: false, threshold: null },
  promo: { active: false, fee: 0, startsAt: null, endsAt: null, minSubtotal: null, banner: null },
  note: '',
};

const CTX: PricingContext = { now: new Date('2026-11-10T12:00:00Z'), signedIn: true, codes: [] };

const TEE_LINE: PricedProduct = {
  productId: 'tee-1',
  brandId: 'adidas',
  categoryIds: ['apparel', 't-shirts'],
  type: '',
  modelGroup: null,
  colors: [],
  sizes: [],
  tags: [],
  price: 1_000,
  name: 'Tee',
  compareAtPrice: null,
};

function freeShippingOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'free-ship',
    name: 'Free shipping this month',
    title: 'Free shipping',
    badge: null,
    description: null,
    active: true,
    archived: false,
    visibility: 'public',
    audience: 'everyone',
    schedule: { startsAt: null, endsAt: null, timezone: 'Africa/Cairo' },
    priority: 0,
    stacking: 'stackable',
    saleItems: 'bestOf',
    scope: 'cart',
    conditions: { anyOf: [] },
    exclude: { anyOf: [] },
    minimum: null,
    reward: { kind: 'freeShipping' },
    limits: { totalUses: null, perCustomer: null },
    requiresCode: false,
    ...overrides,
  };
}

function quote(
  region: 'egypt' | 'international',
  goodsSubtotal: number,
  offers: readonly Offer[],
  settings: ShippingSettings = SETTINGS,
) {
  return shippingQuote(
    settings,
    { region, totalWeightGrams: 250, goodsSubtotal, lines: [TEE_LINE] },
    offers,
    CTX,
  );
}

describe('free shipping offers are for Egypt orders only', () => {
  it('Egypt: a live Free shipping offer makes shipping free', () => {
    const result = quote('egypt', 1_000, [freeShippingOffer()]);
    assert.equal(result.fee, 0);
    assert.equal(result.reason, 'offer');
    assert.equal(result.offerId, 'free-ship');
  });

  it('Egypt: below the offer minimum the box fee is paid', () => {
    const offer = freeShippingOffer({ minimum: { subtotal: 2_000 } });
    assert.equal(quote('egypt', 1_999, [offer]).fee, 115);
    assert.equal(quote('egypt', 2_000, [offer]).fee, 0);
  });

  it('Egypt: an offer limited to other products does not apply', () => {
    const offer = freeShippingOffer({
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['rackets'] }] }] },
    });
    assert.equal(quote('egypt', 1_000, [offer]).fee, 115);
  });

  it('abroad: the same offer never changes shipping', () => {
    const result = quote('international', 1_000, [freeShippingOffer()]);
    assert.equal(result.fee, 1_800);
    assert.equal(result.reason, 'box');
    assert.equal(result.offerId, undefined);
  });

  it('abroad: an offer with its minimum met still pays the box fee', () => {
    const offer = freeShippingOffer({ minimum: { subtotal: 500 } });
    assert.equal(quote('international', 5_000, [offer]).fee, 1_800);
  });

  it('both regions: Settings → Shipping free over still applies (unchanged)', () => {
    const settings: ShippingSettings = { ...SETTINGS, freeOver: { active: true, threshold: 3_000 } };
    assert.equal(quote('egypt', 3_000, [], settings).reason, 'freeOver');
    assert.equal(quote('international', 3_000, [freeShippingOffer()], settings).reason, 'freeOver');
  });
});

describe('free shipping offers respect Except rules', () => {
  const BRAND_X_LINE: PricedProduct = { ...TEE_LINE, productId: 'x-1', brandId: 'brand-x' };
  const exceptBrandX = freeShippingOffer({
    exclude: { anyOf: [{ allOf: [{ field: 'brandId', in: ['brand-x'] }] }] },
  });

  function quoteLines(lines: readonly PricedProduct[], offers: readonly Offer[]) {
    return shippingQuote(
      SETTINGS,
      { region: 'egypt', totalWeightGrams: 250, goodsSubtotal: 1_000, lines },
      offers,
      CTX,
    );
  }

  it('"all except Brand X" with a Brand X-only bag pays the box fee', () => {
    const result = quoteLines([BRAND_X_LINE], [exceptBrandX]);
    assert.equal(result.fee, 115);
    assert.equal(result.reason, 'box');
    assert.equal(result.offerId, undefined);
  });

  it('"all except Brand X" with a mixed bag ships free', () => {
    const result = quoteLines([BRAND_X_LINE, TEE_LINE], [exceptBrandX]);
    assert.equal(result.fee, 0);
    assert.equal(result.reason, 'offer');
    assert.equal(result.offerId, 'free-ship');
  });

  it('no lines: only an offer with no product rules and no Except rules applies', () => {
    const noLines = (offers: readonly Offer[]) =>
      shippingQuote(SETTINGS, { region: 'egypt', totalWeightGrams: 250, goodsSubtotal: 1_000 }, offers, CTX);
    assert.equal(noLines([freeShippingOffer()]).fee, 0);
    assert.equal(noLines([exceptBrandX]).fee, 115);
  });
});
