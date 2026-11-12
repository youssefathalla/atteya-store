import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  homeSummary,
  isSettingsHistoryDoc,
  navigationSummary,
  savedByUid,
  versionsToPrune,
} from '../../lib/settings/settings-history.js';

describe('settings history', () => {
  it('keeps history only for navigation and home', () => {
    assert.equal(isSettingsHistoryDoc('navigation'), true);
    assert.equal(isSettingsHistoryDoc('home'), true);
    assert.equal(isSettingsHistoryDoc('shipping'), false);
    assert.equal(isSettingsHistoryDoc('currency'), false);
  });

  it('counts menus and links, leaving out columns that fill themselves', () => {
    const summary = navigationSummary({
      categories: [
        { id: 'a', label: 'A', megaMenu: [{ links: [{}, {}] }, { links: [{}], auto: { kind: 'brands' } }] },
        { id: 'b', label: 'B' },
      ],
    });
    assert.equal(summary, '2 menus, 2 links');
    assert.equal(navigationSummary({ categories: [{ megaMenu: [{ links: [{}] }] }] }), '1 menu, 1 link');
    assert.equal(navigationSummary({}), '0 menus, 0 links');
  });

  it('counts the hero slides shown, shop cards and category links', () => {
    assert.equal(
      homeSummary({
        hero: { layoutCount: 2, slides: [{}, {}, {}] },
        shopCategories: { cards: [{}, {}, {}] },
        navList: { items: [{}] },
      }),
      '2 hero slides, 3 shop cards, 1 category link',
    );
    assert.equal(homeSummary({ hero: { headline: 'Old' } }), '1 hero slide, 0 shop cards, 0 category links');
  });

  it('reads the saver uid only when it is a plain string', () => {
    assert.equal(savedByUid({ updatedBy: 'abc' }), 'abc');
    assert.equal(savedByUid({ updatedBy: '' }), null);
    assert.equal(savedByUid({ updatedBy: 5 }), null);
    assert.equal(savedByUid({}), null);
  });

  it('prunes everything after the newest 30', () => {
    const ids = Array.from({ length: 33 }, (_, i) => `v${i}`);
    assert.deepEqual(versionsToPrune(ids), ['v30', 'v31', 'v32']);
    assert.deepEqual(versionsToPrune(ids.slice(0, 30)), []);
  });
});
