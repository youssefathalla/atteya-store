import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  brandDeleteBlockedReason,
  catalogSlugFromName,
  categoryDeleteBlockedReason,
  categoryPlacement,
  newCatalogId,
  offerNamesCatalogId,
  readReorderRequest,
  readSaveBrandRequest,
  readSaveCategoryRequest,
  RESERVED_CATEGORY_SLUGS,
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
  it('never deletes a built-in category or brand', () => {
    assert.match(categoryDeleteBlockedReason('rackets', { products: 0, subCategories: 0 }) ?? '', /built-in/);
    assert.match(brandDeleteBlockedReason('nox', 0) ?? '', /built-in/);
  });

  it('refuses a category with sub-categories or products', () => {
    assert.match(
      categoryDeleteBlockedReason('caps', { products: 0, subCategories: 1 }) ?? '',
      /sub-categories/,
    );
    assert.match(categoryDeleteBlockedReason('caps', { products: 2, subCategories: 0 }) ?? '', /2 products/);
    assert.match(
      categoryDeleteBlockedReason('caps', { products: 1, subCategories: 0 }) ?? '',
      /1 product is/,
    );
  });

  it('allows an empty added category or brand', () => {
    assert.equal(categoryDeleteBlockedReason('caps', { products: 0, subCategories: 0 }), null);
    assert.equal(brandDeleteBlockedReason('kuikma', 0), null);
    assert.match(brandDeleteBlockedReason('kuikma', 3) ?? '', /3 products/);
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

  it('blocks deleting a category or brand an offer uses', () => {
    assert.match(
      categoryDeleteBlockedReason('caps', { products: 0, subCategories: 0, offers: 1 }) ?? '',
      /offer/,
    );
    assert.match(brandDeleteBlockedReason('kuikma', 0, 2) ?? '', /offer/);
  });
});
