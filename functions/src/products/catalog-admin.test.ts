import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  brandDeleteBlockedReason,
  catalogSlugFromName,
  categoryDeleteBlockedReason,
  categoryPlacement,
  ENGLISH_NAME_MESSAGE,
  hasEnglishLetterOrDigit,
  isBuiltInCatalogId,
  newCatalogId,
  offerCatalogIds,
  offerDisplayName,
  offerNamesCatalogId,
  productCountPhrase,
  readDeletedBuiltInIds,
  readDeleteRequest,
  readReorderRequest,
  readSaveBrandRequest,
  readSaveCategoryRequest,
  RESERVED_CATEGORY_SLUGS,
  seedsToKeep,
  sortOrderFor,
} from '../../lib/products/catalog-admin.js';

describe('newCatalogId', () => {
  it('builds the link name from the name, folding accents', () => {
    assert.equal(catalogSlugFromName('Caps & Hats'), 'caps-hats');
    assert.equal(catalogSlugFromName('Galán Padel'), 'galan-padel');
    assert.equal(newCatalogId('Caps', new Set()), 'caps');
  });

  it('adds -2, -3 when the link name is taken', () => {
    assert.equal(newCatalogId('Caps', new Set(['caps'])), 'caps-2');
    assert.equal(newCatalogId('Caps', new Set(['caps', 'caps-2'])), 'caps-3');
  });

  it('never uses a reserved storefront word', () => {
    assert.equal(newCatalogId('Shop', RESERVED_CATEGORY_SLUGS), 'shop-2');
    assert.equal(newCatalogId('All', RESERVED_CATEGORY_SLUGS), 'all-2');
  });

  it('gives null when the name has no letter or digit', () => {
    assert.equal(newCatalogId('!!!', new Set()), null);
    assert.equal(newCatalogId('قبعات', new Set()), null);
  });
});

describe('categoryPlacement', () => {
  it('places a top-level category', () => {
    assert.deepEqual(categoryPlacement('caps', null), {
      parentId: null,
      ancestorIds: [],
      path: 'caps',
      depth: 0,
    });
  });

  it('places a sub-category under a top-level parent', () => {
    assert.deepEqual(categoryPlacement('caps', { id: 'apparel', path: 'apparel', depth: 0 }), {
      parentId: 'apparel',
      ancestorIds: ['apparel'],
      path: 'apparel/caps',
      depth: 1,
    });
  });

  it('refuses a third level', () => {
    assert.equal(
      typeof categoryPlacement('caps', { id: 't-shirts', path: 'apparel/t-shirts', depth: 1 }),
      'string',
    );
  });
});

describe('delete rules', () => {
  const none = { live: 0, hidden: 0 };

  it('deletes any empty category or brand, built-in ones too', () => {
    assert.equal(categoryDeleteBlockedReason('Rackets', { products: none, subCategories: 0 }), null);
    assert.equal(categoryDeleteBlockedReason('Caps', { products: none, subCategories: 0 }), null);
    assert.equal(brandDeleteBlockedReason('Nox', none), null);
    assert.equal(brandDeleteBlockedReason('Kuikma', none), null);
  });

  it('refuses a category with products, counting hidden ones too', () => {
    assert.equal(
      categoryDeleteBlockedReason('Apparel', { products: { live: 61, hidden: 0 }, subCategories: 6 }),
      'Apparel still has 61 products. Move them to another category first, or hide it instead.',
    );
    assert.equal(
      categoryDeleteBlockedReason('Apparel', { products: { live: 58, hidden: 3 }, subCategories: 0 }),
      'Apparel still has 58 live and 3 hidden products. Move them to another category first, or hide it instead.',
    );
    assert.equal(
      categoryDeleteBlockedReason('Caps', { products: { live: 0, hidden: 1 }, subCategories: 0 }),
      'Caps still has 1 hidden product. Move it to another category first, or hide it instead.',
    );
  });

  it('refuses a main category with categories inside', () => {
    assert.equal(
      categoryDeleteBlockedReason('Apparel', { products: none, subCategories: 6 }),
      'Delete or move the 6 categories inside Apparel first.',
    );
    assert.equal(
      categoryDeleteBlockedReason('Apparel', { products: none, subCategories: 1 }),
      'Delete or move the category inside Apparel first.',
    );
  });

  it('refuses a brand with products', () => {
    assert.equal(
      brandDeleteBlockedReason('Nox', { live: 3, hidden: 0 }),
      'Nox still has 3 products. Change their brand first, or hide it instead.',
    );
    assert.equal(
      brandDeleteBlockedReason('Nox', { live: 0, hidden: 1 }),
      'Nox still has 1 hidden product. Change its brand first, or hide it instead.',
    );
  });

  it('counts products in plain words', () => {
    assert.equal(productCountPhrase({ live: 1, hidden: 0 }), '1 product');
    assert.equal(productCountPhrase({ live: 0, hidden: 2 }), '2 hidden products');
    assert.equal(productCountPhrase({ live: 1, hidden: 1 }), '1 live and 1 hidden products');
  });

  it('reads a check request', () => {
    assert.deepEqual(readDeleteRequest({ id: 'caps' }), { id: 'caps', check: false });
    assert.deepEqual(readDeleteRequest({ id: 'caps', check: true }), { id: 'caps', check: true });
    assert.equal(typeof readDeleteRequest({ id: '' }), 'string');
  });

  it('knows the built-in ids', () => {
    assert.equal(isBuiltInCatalogId('categories', 'rackets'), true);
    assert.equal(isBuiltInCatalogId('categories', 'caps-2'), false);
    assert.equal(isBuiltInCatalogId('brands', 'nox'), true);
  });
});

describe('deleted built-ins and Check catalogue structure', () => {
  it('reads the saved list, ignoring anything that is not an id', () => {
    assert.deepEqual([...readDeletedBuiltInIds(['bottles', 3, 'Bad Id', 'nox'])], ['bottles', 'nox']);
    assert.equal(readDeletedBuiltInIds(undefined).size, 0);
    assert.equal(readDeletedBuiltInIds('bottles').size, 0);
  });

  it('skips seeds staff deleted, and seeds under a deleted parent', () => {
    const seeds = [
      { id: 'accessories', ancestorIds: [] },
      { id: 'bottles', ancestorIds: ['accessories'] },
      { id: 'bags', ancestorIds: ['accessories'] },
      { id: 'rackets', ancestorIds: [] },
    ];
    const result = seedsToKeep(seeds, new Set(['bottles']));
    assert.deepEqual(
      result.keep.map((seed) => seed.id),
      ['accessories', 'bags', 'rackets'],
    );
    assert.deepEqual(result.deletedByStaff, ['bottles']);
    const parentGone = seedsToKeep(seeds, new Set(['accessories']));
    assert.deepEqual(parentGone.deletedByStaff, ['accessories', 'bottles', 'bags']);
  });

  it('keeps every seed when nothing was deleted', () => {
    const brands = [{ id: 'nox' }, { id: 'adidas' }];
    assert.equal(seedsToKeep(brands, new Set()).keep.length, 2);
  });
});

describe('English names', () => {
  it('needs an English letter or digit to make an address', () => {
    assert.equal(hasEnglishLetterOrDigit('Padel Caps'), true);
    assert.equal(hasEnglishLetterOrDigit('قبعات 2'), true);
    assert.equal(hasEnglishLetterOrDigit('قبعات'), false);
  });

  it('refuses a new category or brand named only in Arabic, but not a rename', () => {
    const category = {
      id: null,
      name: 'قبعات',
      parentId: null,
      description: '',
      image: null,
      published: true,
    };
    assert.equal(readSaveCategoryRequest(category), ENGLISH_NAME_MESSAGE);
    assert.equal(typeof readSaveCategoryRequest({ ...category, id: 'caps' }), 'object');
    assert.equal(
      readSaveBrandRequest({ id: null, name: 'نوكس', logo: null, published: true }),
      ENGLISH_NAME_MESSAGE,
    );
  });
});

describe('readSaveCategoryRequest', () => {
  const valid = {
    id: null,
    name: '  Caps   and hats ',
    parentId: 'apparel',
    description: ' Sun caps ',
    image: { path: 'categories/caps/a.jpg', alt: 'A cap', width: 800, height: 800 },
    defaultWeightGrams: 120,
    published: false,
  };

  it('reads a new category and tidies the text', () => {
    assert.deepEqual(readSaveCategoryRequest(valid), {
      id: null,
      name: 'Caps and hats',
      parentId: 'apparel',
      description: 'Sun caps',
      image: { path: 'categories/caps/a.jpg', alt: 'A cap', width: 800, height: 800 },
      defaultWeightGrams: 120,
      published: false,
    });
  });

  it('keeps the weight as it is when it is not sent', () => {
    const { defaultWeightGrams: _ignored, ...rest } = valid;
    const read = readSaveCategoryRequest(rest);
    assert.equal(typeof read === 'object' ? read.defaultWeightGrams : 'x', undefined);
  });

  it('refuses a missing or long name, a bad id, a photo outside categories/ and a bad weight', () => {
    assert.equal(typeof readSaveCategoryRequest({ ...valid, name: '  ' }), 'string');
    assert.equal(typeof readSaveCategoryRequest({ ...valid, name: 'x'.repeat(61) }), 'string');
    assert.equal(typeof readSaveCategoryRequest({ ...valid, id: 'A/B' }), 'string');
    assert.equal(
      typeof readSaveCategoryRequest({ ...valid, image: { path: 'products/x/a.jpg', alt: 'x' } }),
      'string',
    );
    assert.equal(
      typeof readSaveCategoryRequest({ ...valid, image: { path: 'categories/../a.jpg', alt: 'x' } }),
      'string',
    );
    assert.equal(typeof readSaveCategoryRequest({ ...valid, defaultWeightGrams: 1.5 }), 'string');
    assert.equal(typeof readSaveCategoryRequest({ ...valid, published: 'yes' }), 'string');
  });

  it('reads the name on Shop tabs: tidied, empty for none, left out when not sent', () => {
    const read = readSaveCategoryRequest({ ...valid, shopLabel: '  Padel   gear ' });
    assert.equal(typeof read === 'object' ? read.shopLabel : 'x', 'Padel gear');
    const cleared = readSaveCategoryRequest({ ...valid, shopLabel: '' });
    assert.equal(typeof cleared === 'object' ? cleared.shopLabel : 'x', '');
    const missing = readSaveCategoryRequest(valid);
    assert.equal(typeof missing === 'object' && 'shopLabel' in missing, false);
    assert.equal(typeof readSaveCategoryRequest({ ...valid, shopLabel: 'x'.repeat(31) }), 'string');
    assert.equal(typeof readSaveCategoryRequest({ ...valid, shopLabel: 12 }), 'string');
  });

  it('reads the size chart and details title: a choice, null for same as parent, left out when not sent', () => {
    const read = readSaveCategoryRequest({ ...valid, sizeChart: 'clothing', detailsTitle: 'materials' });
    assert.equal(typeof read === 'object' ? read.sizeChart : 'x', 'clothing');
    assert.equal(typeof read === 'object' ? read.detailsTitle : 'x', 'materials');
    const parent = readSaveCategoryRequest({ ...valid, sizeChart: null, detailsTitle: null });
    assert.equal(typeof parent === 'object' ? parent.sizeChart : 'x', null);
    assert.equal(typeof parent === 'object' ? parent.detailsTitle : 'x', null);
    const missing = readSaveCategoryRequest(valid);
    assert.equal(typeof missing === 'object' && 'sizeChart' in missing, false);
    assert.equal(typeof missing === 'object' && 'detailsTitle' in missing, false);
    assert.equal(typeof readSaveCategoryRequest({ ...valid, sizeChart: 'shoes' }), 'string');
    assert.equal(typeof readSaveCategoryRequest({ ...valid, detailsTitle: 'Materials' }), 'string');
  });
});

describe('readSaveBrandRequest', () => {
  it('reads a brand and refuses a logo outside brands/', () => {
    assert.deepEqual(readSaveBrandRequest({ id: 'nox', name: 'NOX', logo: null, published: true }), {
      id: 'nox',
      name: 'NOX',
      logo: null,
      published: true,
    });
    assert.equal(
      typeof readSaveBrandRequest({
        name: 'NOX',
        logo: { path: 'categories/a.jpg', alt: 'x' },
        published: true,
      }),
      'string',
    );
  });
});

describe('readReorderRequest', () => {
  it('reads one level and refuses repeats', () => {
    assert.deepEqual(readReorderRequest({ kind: 'brands', ids: ['nox', 'head'] }), {
      kind: 'brands',
      ids: ['nox', 'head'],
    });
    assert.equal(typeof readReorderRequest({ kind: 'brands', ids: ['nox', 'nox'] }), 'string');
    assert.equal(typeof readReorderRequest({ kind: 'products', ids: ['nox'] }), 'string');
    assert.equal(sortOrderFor(0), 10);
    assert.equal(sortOrderFor(2), 30);
  });
});

describe('offerNamesCatalogId', () => {
  const offer = {
    conditions: {
      anyOf: [
        {
          allOf: [
            { field: 'brandId', in: ['nox'] },
            { field: 'price', min: 100 },
          ],
        },
      ],
    },
    reward: { kind: 'buyXGetY', get: { anyOf: [{ allOf: [{ field: 'categoryIds', notIn: ['socks'] }] }] } },
  };

  it('finds a brand or category named in any rule', () => {
    assert.equal(offerNamesCatalogId(offer, 'brandId', 'nox'), true);
    assert.equal(offerNamesCatalogId(offer, 'categoryIds', 'socks'), true);
  });

  it('ignores other ids and other fields', () => {
    assert.equal(offerNamesCatalogId(offer, 'brandId', 'head'), false);
    assert.equal(offerNamesCatalogId(offer, 'categoryIds', 'nox'), false);
    assert.equal(offerNamesCatalogId(null, 'brandId', 'nox'), false);
  });

  it('lists every category and brand id an offer names, so a new one never reuses them', () => {
    const offer = {
      rules: [{ field: 'categoryIds', in: ['caps', 'Bad Id'] }],
      reward: {
        conditions: [
          { field: 'brandId', notIn: ['nox'] },
          { field: 'type', in: ['balls'] },
        ],
      },
    };
    assert.deepEqual([...offerCatalogIds(offer)].sort(), ['caps', 'nox']);
    assert.equal(newCatalogId('Caps', new Set(offerCatalogIds(offer))), 'caps-2');
  });

  it('names an offer by its name, then its title, then its id', () => {
    assert.equal(offerDisplayName('o1', { name: 'Summer Sale', title: 'Sale' }), 'Summer Sale');
    assert.equal(offerDisplayName('o1', { name: ' ', title: 'Sale' }), 'Sale');
    assert.equal(offerDisplayName('o1', {}), 'o1');
  });
});
