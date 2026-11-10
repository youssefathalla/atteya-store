import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled code (`npm test` builds first).
import { parseOfferDoc } from '../../lib/offers/offer-schema.js';
import { liveOffers, priceBagDeals, priceItem } from '../../lib/offers/engine/index.js';
import {
  OFFER_LIMIT_ACTOR,
  confirmedEndedOfferIds,
  isLastOfferUse,
  offerFullReason,
  readOfferUses,
  releaseOfferUses,
} from '../../lib/orders/offer-usage.js';
import {
  addUsedOffer,
  freeShippingOfferIdOf,
  giftWorth,
  missedDealOfferId,
  priceWithFreshOffersOnMiss,
} from '../../lib/orders/order-pricing.server.js';
import { parseOfferIds } from '../../lib/orders/order-request.js';

/** In-memory stand-in for the few Firestore calls `readOfferUses` / `releaseOfferUses` make. */
function fakeDb(docs: Record<string, Record<string, unknown>>) {
  const store = new Map(Object.entries(docs).map(([path, data]) => [path, { ...data }]));
  const writes: { op: 'set' | 'update'; path: string; data: Record<string, unknown> }[] = [];
  const ref = (path: string) => ({ path });
  const snap = (path: string) => ({ exists: store.has(path), data: () => store.get(path) });
  const tx = {
    get: async (r: { path: string }) => snap(r.path),
    set: (r: { path: string }, data: Record<string, unknown>) => {
      writes.push({ op: 'set', path: r.path, data });
      store.set(r.path, { ...(store.get(r.path) ?? {}), ...data });
    },
    update: (r: { path: string }, data: Record<string, unknown>) => {
      if (!store.has(r.path)) throw new Error(`no doc ${r.path}`);
      writes.push({ op: 'update', path: r.path, data });
      store.set(r.path, { ...store.get(r.path), ...data });
    },
  };
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    getAll: async (...refs: { path: string }[]) => refs.map((r) => snap(r.path)),
    runTransaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, tx: tx as any, store, writes };
}

const DEAL = {
  offerId: 'deal-1',
  title: 'Buy 2, get 1 free',
  limits: { totalUses: 3, perCustomer: null },
  kind: 'deal' as const,
};

describe('offer limits', () => {
  it('knows the last use and why an offer is full', () => {
    assert.equal(isLastOfferUse({ totalUses: 3, perCustomer: null }, 2), true);
    assert.equal(isLastOfferUse({ totalUses: 3, perCustomer: null }, 1), false);
    assert.equal(isLastOfferUse({ totalUses: null, perCustomer: 1 }, 99), false);
    assert.equal(offerFullReason({ totalUses: 3, perCustomer: 1 }, 3, 0), 'ended');
    assert.equal(offerFullReason({ totalUses: 3, perCustomer: 1 }, 1, 1), 'used');
    assert.equal(offerFullReason({ totalUses: 3, perCustomer: 1 }, 1, 0), null);
  });

  it('switches the offer off when an order uses its last use', async () => {
    const { db, tx, store } = fakeDb({
      'offers/deal-1': { active: true, title: DEAL.title },
      'offerUsage/deal-1': { count: 2 },
    });
    const addUses = await readOfferUses(tx, db, 'shopper-1', [DEAL]);
    const ended = addUses();
    assert.deepEqual(ended, ['deal-1']);
    assert.equal(store.get('offers/deal-1')?.['active'], false);
    assert.equal(store.get('offers/deal-1')?.['updatedBy'], OFFER_LIMIT_ACTOR);
    assert.equal(store.get('offerUsage/deal-1')?.['count'], 3);
    assert.equal(store.get('offerUsage/deal-1_shopper-1')?.['count'], 1);
  });

  it('switches a Free gift offer off at its last use too', async () => {
    const gift = {
      ...DEAL,
      offerId: 'gift-1',
      kind: 'gift' as const,
      limits: { totalUses: 1, perCustomer: null },
    };
    const { db, tx, store } = fakeDb({ 'offers/gift-1': { active: true } });
    const ended = (await readOfferUses(tx, db, 'shopper-1', [gift]))();
    assert.deepEqual(ended, ['gift-1']);
    assert.equal(store.get('offers/gift-1')?.['active'], false);
  });

  it('refuses a full Buy X Get Y offer with its id and a plain message', async () => {
    const { db, tx, writes } = fakeDb({
      'offers/deal-1': { active: true },
      'offerUsage/deal-1': { count: 3 },
    });
    await assert.rejects(readOfferUses(tx, db, 'shopper-1', [DEAL]), (error: unknown) => {
      const err = error as { code: string; message: string; details: unknown };
      assert.equal(err.code, 'failed-precondition');
      assert.deepEqual(err.details, { endedOfferId: 'deal-1' });
      assert.equal(
        err.message,
        "The Buy 2, get 1 free offer has ended, so this order's total changed. Check your bag and place your order again.",
      );
      return true;
    });
    assert.equal(writes.length, 0);
  });

  it("refuses when the shopper's own uses are gone", async () => {
    const perCustomer = { ...DEAL, limits: { totalUses: null, perCustomer: 1 } };
    const { db, tx } = fakeDb({ 'offerUsage/deal-1_shopper-1': { count: 1 } });
    await assert.rejects(readOfferUses(tx, db, 'shopper-1', [perCustomer]), (error: unknown) => {
      const err = error as { message: string; details: unknown };
      assert.deepEqual(err.details, { endedOfferId: 'deal-1', reason: 'used' });
      assert.match(err.message, /^You've already used the Buy 2, get 1 free offer/);
      return true;
    });
  });

  it('counts a use of an offer with room left and keeps it on', async () => {
    const { db, tx, store, writes } = fakeDb({
      'offers/deal-1': { active: true },
      'offerUsage/deal-1': { count: 0 },
    });
    const ended = (await readOfferUses(tx, db, 'shopper-1', [DEAL]))();
    assert.deepEqual(ended, []);
    assert.equal(store.get('offers/deal-1')?.['active'], true);
    assert.equal(store.get('offerUsage/deal-1')?.['count'], 1);
    assert.equal(
      writes.some((write) => write.op === 'update'),
      false,
    );
  });

  it('gives the use back and switches the offer on again when the order is not saved', async () => {
    const { db, tx, store } = fakeDb({
      'offers/deal-1': { active: true },
      'offerUsage/deal-1': { count: 2 },
    });
    const ended = (await readOfferUses(tx, db, 'shopper-1', [DEAL]))();
    await releaseOfferUses(db, 'shopper-1', [DEAL], ended);
    assert.equal(store.get('offers/deal-1')?.['active'], true);
    assert.equal(store.get('offerUsage/deal-1')?.['count'], 2);
    assert.equal(store.get('offerUsage/deal-1_shopper-1')?.['count'], 0);
  });

  it('leaves an offer staff already paused alone at its last use, so a rollback never revives it', async () => {
    const { db, tx, store, writes } = fakeDb({
      'offers/deal-1': { active: false, updatedBy: 'admin-uid' },
      'offerUsage/deal-1': { count: 2 },
    });
    const ended = (await readOfferUses(tx, db, 'shopper-1', [DEAL]))();
    assert.deepEqual(ended, []);
    assert.equal(
      writes.some((write) => write.path === 'offers/deal-1'),
      false,
    );
    await releaseOfferUses(db, 'shopper-1', [DEAL], ended);
    assert.equal(store.get('offers/deal-1')?.['active'], false);
    assert.equal(store.get('offers/deal-1')?.['updatedBy'], 'admin-uid');
  });

  it('never switches on an offer staff switched off themselves', async () => {
    const { db, store } = fakeDb({
      'offers/deal-1': { active: false, updatedBy: 'admin-uid' },
      'offerUsage/deal-1': { count: 3 },
    });
    await releaseOfferUses(db, 'shopper-1', [DEAL], ['deal-1']);
    assert.equal(store.get('offers/deal-1')?.['active'], false);
  });
});

describe('Percent off offer limits', () => {
  const PERCENT = {
    offerId: 'pct-1',
    title: '20% off',
    limits: { totalUses: 1, perCustomer: null },
    kind: 'item' as const,
  };

  it('counts the first order, switches the offer off at its last use and refuses the next one', async () => {
    const { db, tx, store } = fakeDb({ 'offers/pct-1': { active: true, title: PERCENT.title } });
    const ended = (await readOfferUses(tx, db, 'shopper-1', [PERCENT]))();
    assert.deepEqual(ended, ['pct-1']);
    assert.equal(store.get('offers/pct-1')?.['active'], false);
    assert.equal(store.get('offers/pct-1')?.['updatedBy'], OFFER_LIMIT_ACTOR);
    assert.equal(store.get('offerUsage/pct-1')?.['count'], 1);

    await assert.rejects(readOfferUses(tx, db, 'shopper-2', [PERCENT]), (error: unknown) => {
      const err = error as { code: string; message: string; details: unknown };
      assert.equal(err.code, 'failed-precondition');
      assert.deepEqual(err.details, { endedOfferId: 'pct-1' });
      assert.equal(
        err.message,
        "The 20% off offer has ended, so this order's total changed. Check your bag and place your order again.",
      );
      return true;
    });
  });

  it("refuses when the shopper's own uses are gone, with the offer's id", async () => {
    const perCustomer = { ...PERCENT, limits: { totalUses: null, perCustomer: 1 } };
    const { db, tx } = fakeDb({ 'offerUsage/pct-1_shopper-1': { count: 1 } });
    await assert.rejects(readOfferUses(tx, db, 'shopper-1', [perCustomer]), (error: unknown) => {
      const err = error as { message: string; details: unknown };
      assert.deepEqual(err.details, { endedOfferId: 'pct-1', reason: 'used' });
      assert.equal(
        err.message,
        "You've already used the 20% off offer, so this order's total changed. Check your bag and place your order again.",
      );
      return true;
    });
    // Another shopper still gets it.
    const { db: db2, tx: tx2, store } = fakeDb({ 'offerUsage/pct-1_shopper-1': { count: 1 } });
    (await readOfferUses(tx2, db2, 'shopper-2', [perCustomer]))();
    assert.equal(store.get('offerUsage/pct-1_shopper-2')?.['count'], 1);
  });

  it('gives the use back and switches it on again when a Paymob start fails', async () => {
    const { db, tx, store } = fakeDb({ 'offers/pct-1': { active: true } });
    const ended = (await readOfferUses(tx, db, 'shopper-1', [PERCENT]))();
    await releaseOfferUses(db, 'shopper-1', [PERCENT], ended);
    assert.equal(store.get('offers/pct-1')?.['active'], true);
    assert.equal(store.get('offerUsage/pct-1')?.['count'], 0);
  });

  it('confirms an ended Percent off id from checkout, and the item then costs its full price', async () => {
    const offer = parseOfferDoc('pct-1', {
      name: 'Tees 20%',
      title: '20% off',
      active: true,
      scope: 'item',
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
      reward: { kind: 'percentOff', percent: 20 },
      limits: { totalUses: null, perCustomer: 1 },
    });
    assert.ok(offer);
    const ctx = { now: new Date('2026-11-09T12:00:00Z'), signedIn: true, codes: [] };
    const tee = {
      productId: 'tee-1',
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
    const before = priceItem(tee as never, null, [offer], ctx);
    assert.equal(before.effectivePrice, 400);
    assert.equal(before.appliedOfferId, 'pct-1');

    const { db } = fakeDb({ 'offerUsage/pct-1_shopper-1': { count: 1 } });
    const ended = await confirmedEndedOfferIds(db, 'shopper-1', [offer], ['pct-1']);
    assert.deepEqual([...ended], ['pct-1']);
    const after = priceItem(
      tee as never,
      null,
      [offer].filter((entry) => !ended.has(entry.id)),
      ctx,
    );
    assert.equal(after.effectivePrice, 500);

    // Another shopper with uses left: the id is not confirmed, so the price stays.
    const other = await confirmedEndedOfferIds(db, 'shopper-2', [offer], ['pct-1']);
    assert.equal(other.size, 0);
  });

  it('counts each offer once per order, whatever it gives', () => {
    const offers = [
      { id: 'pct-1', title: '20% off', limits: { totalUses: 5, perCustomer: null } },
      { id: 'ship-1', title: 'Free shipping', limits: { totalUses: null, perCustomer: 1 } },
    ];
    const used = new Map();
    addUsedOffer(used, offers as never, 'pct-1', 'item');
    addUsedOffer(used, offers as never, 'pct-1', 'item');
    addUsedOffer(used, offers as never, 'ship-1', 'shipping');
    addUsedOffer(used, offers as never, 'gone', 'item');
    // No limits: nothing to count, so no shared counter to write on every order.
    addUsedOffer(
      used,
      [{ id: 'open', title: '10% off', limits: { totalUses: null, perCustomer: null } }] as never,
      'open',
      'item',
    );
    assert.deepEqual(
      [...used.values()].map((offer) => [offer.offerId, offer.kind]),
      [
        ['pct-1', 'item'],
        ['ship-1', 'shipping'],
      ],
    );
  });

  it('counts a Free shipping offer only when it made the shipping free', () => {
    const box = { feeEgp: 115 };
    assert.equal(freeShippingOfferIdOf({ fee: 0, reason: 'offer', offerId: 'ship-1', box }), 'ship-1');
    assert.equal(freeShippingOfferIdOf({ fee: 0, reason: 'freeOver', box }), null);
    assert.equal(freeShippingOfferIdOf({ fee: 0, reason: 'promo', box }), null);
    assert.equal(freeShippingOfferIdOf({ fee: 115, reason: 'box', box }), null);
    // The box already costs nothing: the offer saved the shopper nothing, so it isn't counted.
    assert.equal(
      freeShippingOfferIdOf({ fee: 0, reason: 'offer', offerId: 'ship-1', box: { feeEgp: 0 } }),
      null,
    );
  });
});

describe('ended offers from checkout', () => {
  const CTX = { now: new Date('2026-11-09T12:00:00Z'), signedIn: true, codes: [] };
  const TEE = {
    productId: 'tee-1',
    brandId: 'adidas',
    categoryIds: ['apparel', 't-shirts'],
    type: 'tshirt',
    modelGroup: null,
    colors: ['black'],
    sizes: [],
    tags: [],
    price: 500,
  };
  const OFFER = parseOfferDoc('deal-1', {
    name: 'Tees',
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
    limits: { totalUses: 10, perCustomer: 1 },
  });
  const line = {
    product: TEE,
    variant: null,
    quantity: 3,
    basePrice: 500,
    offerPrice: 500,
    onSale: false,
    giftWorth: 0,
  };

  it('reads only usable ids, without repeats', () => {
    assert.deepEqual(parseOfferIds(['deal-1', 'deal-1', 7, '', 'x'.repeat(200), 'deal-2']), [
      'deal-1',
      'deal-2',
    ]);
    assert.deepEqual(parseOfferIds('deal-1'), []);
    assert.deepEqual(parseOfferIds(undefined), []);
  });

  it('prices an offer with room left normally, and leaves out one that has really ended', async () => {
    assert.ok(OFFER);
    const priced = priceBagDeals([line], [OFFER], CTX);
    assert.equal(priced.lines[0]?.discount, 500);
    assert.deepEqual(priced.offerIds, ['deal-1']);
    // This shopper already used their one use, so the server confirms the id checkout sent.
    const { db } = fakeDb({ 'offerUsage/deal-1_shopper-1': { count: 1 } });
    const ended = await confirmedEndedOfferIds(db, 'shopper-1', [OFFER], ['deal-1']);
    assert.deepEqual([...ended], ['deal-1']);
    const withoutEnded = priceBagDeals(
      [line],
      [OFFER].filter((offer) => !ended.has(offer.id)),
      CTX,
    );
    assert.equal(withoutEnded.lines[0]?.discount, 0);
  });

  it('ignores an "ended" id the usage counts do not confirm, so it never lowers the total', async () => {
    // Two offers on the same tees: the higher-priority one takes 50% off, the other makes it free.
    // Dropping the first on the browser's word would let the bigger discount win.
    const half = parseOfferDoc('deal-half', {
      name: 'Tees half',
      title: 'Buy 2, get 1 at 50% off',
      active: true,
      scope: 'item',
      priority: 10,
      conditions: { anyOf: [{ allOf: [{ field: 'categoryIds', in: ['t-shirts'] }] }] },
      reward: {
        kind: 'buyXGetY',
        buy: { quantity: 2 },
        get: { quantity: 1, percent: 50 },
        getConditions: null,
        cheapestFree: true,
        repeat: true,
        maxApplications: null,
      },
      limits: { totalUses: 100, perCustomer: 5 },
    });
    const free = parseOfferDoc('deal-free', {
      name: 'Tees free',
      title: 'Buy 2, get 1 free',
      active: true,
      scope: 'item',
      priority: 1,
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
    assert.ok(half && free);
    const offers = [half, free];
    const honest = priceBagDeals([line], offers, CTX);
    assert.equal(honest.lines[0]?.discount, 250);
    assert.deepEqual(honest.offerIds, ['deal-half']);

    const { db } = fakeDb({
      'offerUsage/deal-half': { count: 3 },
      'offerUsage/deal-half_shopper-1': { count: 1 },
    });
    const ended = await confirmedEndedOfferIds(db, 'shopper-1', offers, ['deal-half', 'not-an-offer']);
    assert.equal(ended.size, 0);
    const priced = priceBagDeals(
      [line],
      offers.filter((offer) => !ended.has(offer.id)),
      CTX,
    );
    assert.equal(priced.lines[0]?.discount, honest.lines[0]?.discount);

    // Had the server trusted the browser, the order would have cost less than the store allows.
    const trusted = priceBagDeals([line], [free], CTX);
    assert.equal(trusted.lines[0]?.discount, 500);
  });

  it('finds a deal the bag showed that the order does not get', () => {
    assert.equal(missedDealOfferId(['deal-1'], ['deal-1']), null);
    assert.equal(missedDealOfferId([], ['deal-1']), null);
    assert.equal(missedDealOfferId(['deal-1', 'deal-2'], ['deal-1']), 'deal-2');
  });
});

describe('a deal the bag showed but the order misses', () => {
  const STALE = [{ id: 'other' }];
  const FRESH = [{ id: 'other' }, { id: 'new-deal' }];
  // Stand-in for priceWithOffers: applies the deal only when the offers list has it.
  const price = async (offers: readonly { id: string }[]) =>
    offers.some((offer) => offer.id === 'new-deal')
      ? { total: 1000 }
      : { missedDealOfferId: 'new-deal', title: 'Buy 2, get 1 free', live: true };

  it('reads the offers again without the cache and prices with them', async () => {
    const loads: boolean[] = [];
    const result = await priceWithFreshOffersOnMiss(async (fresh: boolean) => {
      loads.push(fresh);
      return (fresh ? FRESH : STALE) as never;
    }, price as never);
    assert.deepEqual(result, { total: 1000 });
    assert.deepEqual(loads, [false, true]);
  });

  it('reads the offers only once when nothing is missed', async () => {
    const loads: boolean[] = [];
    await priceWithFreshOffersOnMiss(async (fresh: boolean) => {
      loads.push(fresh);
      return FRESH as never;
    }, price as never);
    assert.deepEqual(loads, [false]);
  });

  it('refuses with changedOfferId, not endedOfferId, when the deal still does not apply', async () => {
    await assert.rejects(
      priceWithFreshOffersOnMiss(async () => STALE as never, price as never),
      (error: unknown) => {
        const err = error as { code: string; message: string; details: Record<string, unknown> };
        assert.equal(err.code, 'failed-precondition');
        assert.equal(err.message, 'Prices in your bag changed. Check your bag and place your order again.');
        assert.deepEqual(err.details, { changedOfferId: 'new-deal' });
        assert.equal('endedOfferId' in err.details, false);
        return true;
      },
    );
  });
});

describe('a missed deal that is no longer live on the server', () => {
  it('is refused as ended (endedOfferId), so checkout leaves it out', async () => {
    // The offer's time is up by the server's clock while the shopper's clock is behind.
    const price = async () => ({ missedDealOfferId: 'old-deal', title: 'Buy 2, get 1 free', live: false });
    await assert.rejects(
      priceWithFreshOffersOnMiss(async () => [] as never, price as never),
      (error: unknown) => {
        const err = error as { code: string; message: string; details: Record<string, unknown> };
        assert.equal(err.code, 'failed-precondition');
        assert.deepEqual(err.details, { endedOfferId: 'old-deal' });
        assert.match(err.message, /^The Buy 2, get 1 free offer has ended/);
        return true;
      },
    );
  });

  it('knows whether a missed offer is live by the server clock', () => {
    const offer = parseOfferDoc('timed', {
      name: 'Timed',
      title: 'Buy 2, get 1 free',
      active: true,
      scope: 'item',
      schedule: { endsAt: '2026-11-09T11:00:00Z' },
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
    assert.ok(offer);
    assert.equal(
      liveOffers([offer], { now: new Date('2026-11-09T12:00:00Z'), signedIn: true, codes: [] }).length,
      0,
    );
    assert.equal(
      liveOffers([offer], { now: new Date('2026-11-09T10:00:00Z'), signedIn: true, codes: [] }).length,
      1,
    );
  });
});

describe('gift worth', () => {
  const picks = { gifts: [{ productId: 'tee-1' }, { productId: 'socks-1' }, { productId: 'gone' }] };
  it('counts only published gift products, as the bag does', () => {
    const docs = new Map([
      ['tee-1', { published: true, price: 400 }],
      ['socks-1', { published: false, price: 150 }],
    ]);
    assert.equal(giftWorth(picks, docs), 400);
  });
});
