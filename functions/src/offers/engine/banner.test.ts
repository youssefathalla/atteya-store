import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// Runs against the compiled engine (`npm test` builds first); engine files import `./x.js`.
import { DEFAULT_OFFER_BANNER, parseOfferBanner, validateOffer } from '../../../lib/offers/engine/index.js';
import { parseOfferDoc } from '../../../lib/offers/offer-schema.js';

const CTX = { now: new Date('2026-11-09T12:00:00Z'), signedIn: true, codes: [] };

function draft(banner, extra = {}) {
  return {
    name: 'Adidas 10%',
    title: '10% off Adidas',
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
    scope: 'item',
    conditions: { anyOf: [] },
    exclude: { anyOf: [] },
    minimum: null,
    reward: { kind: 'percentOff', percent: 10 },
    limits: { totalUses: null, perCustomer: null },
    requiresCode: false,
    banner,
    ...extra,
  };
}

const bannerErrors = (d) =>
  validateOffer(d, [], [], CTX).errors.filter((issue) => issue.code.startsWith('banner'));

describe('offer top banner (ATS-145)', () => {
  it('an old offer without a banner field is not in the banner', () => {
    assert.deepEqual(parseOfferBanner(undefined), DEFAULT_OFFER_BANNER);
    const offer = parseOfferDoc('o1', { name: 'A', title: 'B', reward: { kind: 'freeShipping' } });
    assert.equal(offer.banner.show, false);
    assert.equal(offer.banner.countdown, 'hide');
    assert.equal(offer.banner.countdownDays, 7);
  });

  it('reads the saved settings, trims the text and keeps the days in 1 to 30', () => {
    const banner = parseOfferBanner({
      show: true,
      text: '  Black Friday: 20% off  ',
      countdown: 'lastDays',
      countdownDays: 45,
    });
    assert.deepEqual(banner, {
      show: true,
      text: 'Black Friday: 20% off',
      countdown: 'lastDays',
      countdownDays: 30,
    });
    assert.equal(parseOfferBanner({ show: 'yes', text: '   ', countdown: 'soon' }).show, false);
    assert.equal(parseOfferBanner({ text: '   ' }).text, null);
    assert.equal(parseOfferBanner({ countdown: 'soon' }).countdown, 'hide');
    assert.equal(parseOfferBanner({ countdownDays: 0 }).countdownDays, 1);
  });

  it('only offers for everyone can show in the banner', () => {
    const on = { show: true, text: null, countdown: 'always', countdownDays: 7 };
    assert.deepEqual(bannerErrors(draft(on)), []);
    assert.deepEqual(
      bannerErrors(draft(on, { audience: 'signedIn' })).map((issue) => issue.code),
      ['banner.audience'],
    );
    assert.deepEqual(bannerErrors(draft({ ...on, show: false }, { audience: 'signedIn' })), []);
  });

  it('checks the text length and the countdown days', () => {
    const base = { show: true, text: null, countdown: 'lastDays', countdownDays: 7 };
    assert.deepEqual(
      bannerErrors(draft({ ...base, text: 'x'.repeat(61) })).map((issue) => issue.code),
      ['banner.text'],
    );
    assert.deepEqual(
      bannerErrors(draft({ ...base, countdownDays: 31 })).map((issue) => issue.code),
      ['banner.countdownDays'],
    );
    assert.deepEqual(bannerErrors(draft({ ...base, countdown: 'always', countdownDays: 31 })), []);
    assert.deepEqual(bannerErrors(draft(undefined)), []);
  });
});
