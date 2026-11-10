import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled code (`npm test` builds first).
import { parseOfferDoc } from '../../lib/offers/offer-schema.js';
import { liveOffers, priceBagDeals, priceItem } from '../../lib/offers/engine/index.js';
import {
  costsMoreThanStacked,
  missedBasePrice,
  missedLinePrice,
  outdatedPageError,
  priceChangedError,
  priceWithFreshOffersOnMiss,
  withDeals,
} from '../../lib/orders/order-pricing.server.js';
import { parseShownOfferId, parseShownUnitEgp } from '../../lib/orders/order-request.js';

const CHANGED = 'Prices in your bag changed. Check your bag and place your order again.';
const CTX = { now: new Date('2026-11-09T12:00:00Z'), signedIn: true, codes: [] };
const TEE = {
  productId: 'tee-1',
  name: 'Tee',
  brandId: 'adidas',
  categoryIds: ['apparel', 't-shirts'],
  type: 'tshirt',
  modelGroup: null,
  colors: ['black'],
  sizes: [],
  tags: [],
  price: 500,
  compareAtPrice: null,
};

function percentOffer(id: string, percent: number, active = true) {
  const offer = parseOfferDoc(id, {
    name: `Tees ${percent}%`,
    title: `${percent}% off`,
    active,
    scope: 'item',
    conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
    reward: { kind: 'percentOff', percent },
  });
  assert.ok(offer);
  return offer;
}

/** The server side of one line: the unit price and offer the engine gives with these offers. */
function serverLine(offers: readonly unknown[], product = TEE) {
  const item = priceItem(product, null, offers as never, CTX);
  return { unitEgp: item.effectivePrice, appliedOfferId: item.appliedOfferId };
}

function liveIds(offers: readonly unknown[]): Set<string> {
  return new Set(liveOffers(offers as never, CTX).map((offer: { id: string }) => offer.id));
}

describe('reading what checkout showed', () => {
  it('reads a shown unit price, rounding down, and ignores anything unusable', () => {
    assert.equal(parseShownUnitEgp(400), 400);
    assert.equal(parseShownUnitEgp(0), 0);
    assert.equal(parseShownUnitEgp(399.9), 399);
    assert.equal(parseShownUnitEgp(-1), null);
    assert.equal(parseShownUnitEgp('400'), null);
    assert.equal(parseShownUnitEgp(Number.NaN), null);
    assert.equal(parseShownUnitEgp(undefined), null);
  });

  it('reads a shown offer id', () => {
    assert.equal(parseShownOfferId('off-20'), 'off-20');
    assert.equal(parseShownOfferId(''), null);
    assert.equal(parseShownOfferId('x'.repeat(200)), null);
    assert.equal(parseShownOfferId(7), null);
  });
});

describe('comparing each line with what checkout showed', () => {
  const OFF_20 = percentOffer('off-20', 20);

  it('lets the order through when the server price is lower or equal', () => {
    // Shown at the full price, but a 20% offer started meanwhile: the shopper pays less.
    const shown = [{ productId: 'tee-1', shownUnitEgp: 500, shownOfferId: null }];
    assert.equal(missedLinePrice(shown, [serverLine([OFF_20])], liveIds([OFF_20])), null);
    // Same price as shown.
    const same = [{ productId: 'tee-1', shownUnitEgp: 400, shownOfferId: 'off-20' }];
    assert.equal(missedLinePrice(same, [serverLine([OFF_20])], liveIds([OFF_20])), null);
  });

  it('skips a line without a shown price (older pages)', () => {
    const shown = [{ productId: 'tee-1', shownUnitEgp: null, shownOfferId: null }];
    assert.equal(missedLinePrice(shown, [{ unitEgp: 500, appliedOfferId: null }], new Set()), null);
  });

  it('finds a line that costs more because its offer was paused', () => {
    const paused = percentOffer('off-20', 20, false);
    const shown = [{ productId: 'tee-1', shownUnitEgp: 400, shownOfferId: 'off-20' }];
    assert.equal(serverLine([paused]).unitEgp, 500);
    assert.deepEqual(missedLinePrice(shown, [serverLine([paused])], liveIds([paused])), {
      missedPriceProductId: 'tee-1',
      shownOfferId: 'off-20',
      live: false,
      sameOffer: false,
    });
  });

  it('finds a line whose live offer now gives less', () => {
    const lowered = percentOffer('off-20', 10);
    const shown = [{ productId: 'tee-1', shownUnitEgp: 400, shownOfferId: 'off-20' }];
    assert.deepEqual(missedLinePrice(shown, [serverLine([lowered])], liveIds([lowered])), {
      missedPriceProductId: 'tee-1',
      shownOfferId: 'off-20',
      live: true,
      sameOffer: true,
    });
  });

  it('finds a line whose product price went up while its offer still applies', () => {
    // Shown at 400 (500 less 20%); staff raised the price to 600, so the server says 480.
    const shown = [{ productId: 'tee-1', shownUnitEgp: 400, shownOfferId: 'off-20' }];
    const server = serverLine([OFF_20], { ...TEE, price: 600 });
    assert.equal(server.unitEgp, 480);
    const missed = missedLinePrice(shown, [server], liveIds([OFF_20]));
    assert.deepEqual(missed, {
      missedPriceProductId: 'tee-1',
      shownOfferId: 'off-20',
      live: true,
      sameOffer: true,
    });
    // Checkout reads the products again, and still leaves the offer out if refused twice in a row.
    assert.deepEqual(priceChangedError(missed!).details, {
      priceChanged: true,
      productId: 'tee-1',
      changedOfferId: 'off-20',
    });
  });

  it('never compares a line the server prices lower, even with another offer', () => {
    const OFF_30 = percentOffer('off-30', 30);
    const shown = [{ productId: 'tee-1', shownUnitEgp: 400, shownOfferId: 'off-20' }];
    assert.equal(missedLinePrice(shown, [serverLine([OFF_20, OFF_30])], liveIds([OFF_20, OFF_30])), null);
  });
});

describe('a line that costs more than checkout showed', () => {
  const STALE = [{ id: 'other' }];
  const FRESH = [{ id: 'other' }, { id: 'off-20' }];
  // Stand-in for priceWithOffers: the line gets its shown price only when the offer is there.
  const price = async (offers: readonly { id: string }[]) =>
    offers.some((offer) => offer.id === 'off-20')
      ? { total: 400 }
      : { missedPriceProductId: 'tee-1', shownOfferId: 'off-20', live: true, sameOffer: false };

  it('reads the offers again without the cache and prices with them', async () => {
    const loads: boolean[] = [];
    const result = await priceWithFreshOffersOnMiss(async (fresh: boolean) => {
      loads.push(fresh);
      return (fresh ? FRESH : STALE) as never;
    }, price as never);
    assert.deepEqual(result, { total: 400 });
    assert.deepEqual(loads, [false, true]);
  });

  it('refuses with "Prices in your bag changed" when it still costs more', async () => {
    await assert.rejects(
      priceWithFreshOffersOnMiss(async () => STALE as never, price as never),
      (error: unknown) => {
        const err = error as { code: string; message: string; details: Record<string, unknown> };
        assert.equal(err.code, 'failed-precondition');
        assert.equal(err.message, CHANGED);
        assert.deepEqual(err.details, { changedOfferId: 'off-20' });
        return true;
      },
    );
  });

  it('tells checkout to leave out an offer that is no longer live', () => {
    const err = priceChangedError({
      missedPriceProductId: 'tee-1',
      shownOfferId: 'off-20',
      live: false,
      sameOffer: false,
    });
    assert.equal(err.message, CHANGED);
    assert.deepEqual(err.details, { endedOfferId: 'off-20' });
  });

  it('tells checkout to read the products again when it showed no offer', () => {
    const err = priceChangedError({
      missedPriceProductId: 'tee-1',
      shownOfferId: null,
      live: false,
      sameOffer: false,
    });
    assert.equal(err.message, CHANGED);
    assert.deepEqual(err.details, { priceChanged: true, productId: 'tee-1' });
  });
});

describe('price before per-item offers on pieces in a Buy X Get Y group', () => {
  const line = (extra) => ({ productId: 'tee-1', shownBaseEgp: 1000, baseEgp: 1000, dealUnits: 3, ...extra });

  it('refuses when that price went up on a line with pieces in a group', () => {
    const missed = missedBasePrice([line({ baseEgp: 1200 })]);
    assert.ok(missed);
    const err = priceChangedError(missed);
    assert.equal(err.message, CHANGED);
    assert.deepEqual(err.details, { priceChanged: true, productId: 'tee-1' });
  });

  it('ignores lines with no piece in a group, an older page, and a lower or equal price', () => {
    assert.equal(missedBasePrice([line({ baseEgp: 1200, dealUnits: 0 })]), null);
    assert.equal(missedBasePrice([line({ baseEgp: 1200, shownBaseEgp: null })]), null);
    assert.equal(missedBasePrice([line({ baseEgp: 900 })]), null);
    assert.equal(missedBasePrice([line({})]), null);
  });
});

describe('pages from before one discount per item', () => {
  const b2g1 = parseOfferDoc('b2g1', {
    name: 'b2g1',
    title: 'Buy 2, get 1 free',
    active: true,
    scope: 'item',
    conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
    reward: {
      kind: 'buyXGetY',
      buy: { quantity: 2 },
      get: { quantity: 1, percent: 100 },
      getConditions: null,
      cheapestFree: true,
      repeat: true,
      maxApplications: null,
    },
  });
  const facts = (offerPrice) => [
    {
      product: { ...TEE, price: 1000 },
      variant: null,
      quantity: 3,
      basePrice: 1000,
      offerPrice,
      onSale: false,
      giftWorth: 0,
    },
  ];

  it('is refused with a refresh message when the old page showed Buy X Get Y on top', () => {
    // Old page: 3 × 900 − 900 = 1,800. Now: 2,000.
    assert.equal(costsMoreThanStacked(facts(900), [b2g1], CTX), true);
    const err = outdatedPageError();
    assert.equal(err.message, 'Prices in your bag changed. Refresh the page and place your order again.');
    assert.deepEqual(err.details, { outdatedPage: true });
  });

  it('goes through when the old page showed the same total', () => {
    assert.equal(costsMoreThanStacked(facts(1000), [b2g1], CTX), false);
    assert.equal(costsMoreThanStacked(facts(900), [], CTX), false);
  });

  it('is refused when the per-item offer now wins but the old page stacked both', () => {
    // 50% off: 1,500 now; the old page showed 3 × 500 − 500 = 1,000.
    assert.equal(costsMoreThanStacked(facts(500), [b2g1], CTX), true);
  });
});

describe('order line with Buy X Get Y groups', () => {
  const priced = {
    productId: 'tee-1',
    variantId: null,
    selection: {},
    quantity: 4,
    unitEgp: 900,
    unitDisplay: 900,
    lineDisplay: 3600,
    name: 'Tee',
    optionLabels: [],
    imagePath: null,
  };

  it('saves the line before and after the discount, group pieces at the price before offers', () => {
    const result = priceBagDeals(
      [
        {
          product: { ...TEE, price: 1000 },
          variant: null,
          quantity: 4,
          basePrice: 1000,
          offerPrice: 900,
          onSale: false,
          giftWorth: 0,
        },
      ],
      [
        parseOfferDoc('b2g1', {
          name: 'b2g1',
          title: 'Buy 2, get 1 free',
          active: true,
          scope: 'item',
          conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
          reward: {
            kind: 'buyXGetY',
            buy: { quantity: 2 },
            get: { quantity: 1, percent: 100 },
            getConditions: null,
            cheapestFree: true,
            repeat: true,
            maxApplications: null,
          },
        }),
      ],
      CTX,
    );
    const line = withDeals(priced, result.lines[0]);
    assert.equal(line.unitEgp, 900);
    assert.equal(line.fullEgp, 3900);
    assert.equal(line.discountEgp, 1000);
    assert.equal(line.lineDisplay, 2900);
    assert.deepEqual(line.deals, [{ offerId: 'b2g1', units: 1, percent: 100, discountEgp: 1000 }]);
  });

  it('leaves a line with no piece in a group as it was', () => {
    const none = {
      deals: [],
      discount: 0,
      discountedUnits: 0,
      giftUnits: 4,
      dealUnits: 0,
      offerUnits: 4,
      before: 3600,
      total: 3600,
    };
    assert.equal(withDeals(priced, none), priced);
  });
});
