import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  alreadyInCategory,
  chunk,
  MAX_MOVE_PRODUCTS,
  movedCategoryIds,
  readMoveProductsRequest,
} from '../../lib/products/move-products.js';

describe('readMoveProductsRequest', () => {
  it('reads the ids and the category, dropping repeats', () => {
    assert.deepEqual(readMoveProductsRequest({ productIds: ['a', 'b', 'a'], categoryId: 'hoodies' }), {
      productIds: ['a', 'b'],
      categoryId: 'hoodies',
    });
  });

  it('refuses no products, too many, or an unsafe id', () => {
    assert.equal(typeof readMoveProductsRequest({ productIds: [], categoryId: 'x' }), 'string');
    assert.equal(typeof readMoveProductsRequest({ productIds: ['a/b'], categoryId: 'x' }), 'string');
    assert.equal(typeof readMoveProductsRequest(null), 'string');
    const many = Array.from({ length: MAX_MOVE_PRODUCTS + 1 }, (_, index) => `p${index}`);
    assert.equal(
      readMoveProductsRequest({ productIds: many, categoryId: 'x' }),
      `Move at most ${MAX_MOVE_PRODUCTS} products at a time.`,
    );
  });

  it('refuses a missing or unsafe category', () => {
    assert.equal(readMoveProductsRequest({ productIds: ['a'] }), 'Choose a category.');
    assert.equal(readMoveProductsRequest({ productIds: ['a'], categoryId: '..' }), 'Choose a category.');
  });
});

describe('movedCategoryIds', () => {
  it('puts the parent first, then the category', () => {
    assert.deepEqual(movedCategoryIds({ ancestorIds: ['apparel'], parentId: 'apparel' }, 'hoodies'), [
      'apparel',
      'hoodies',
    ]);
  });

  it('gives a main category on its own', () => {
    assert.deepEqual(movedCategoryIds({ ancestorIds: [], parentId: null }, 'rackets'), ['rackets']);
    assert.deepEqual(movedCategoryIds({}, 'rackets'), ['rackets']);
  });

  it('falls back to parentId when ancestorIds is missing', () => {
    assert.deepEqual(movedCategoryIds({ parentId: 'apparel' }, 'caps'), ['apparel', 'caps']);
  });

  it('refuses a malformed category', () => {
    assert.equal(movedCategoryIds({ ancestorIds: 'apparel' }, 'caps'), null);
    assert.equal(movedCategoryIds({ ancestorIds: [''] }, 'caps'), null);
    assert.equal(movedCategoryIds({ ancestorIds: ['caps'] }, 'caps'), null);
  });
});

describe('alreadyInCategory', () => {
  it('is true only for the same category and the same path', () => {
    assert.equal(
      alreadyInCategory({ categoryId: 'hoodies', categoryIds: ['apparel', 'hoodies'] }, 'hoodies', [
        'apparel',
        'hoodies',
      ]),
      true,
    );
    assert.equal(
      alreadyInCategory({ categoryId: 'hoodies', categoryIds: ['hoodies'] }, 'hoodies', [
        'apparel',
        'hoodies',
      ]),
      false,
    );
  });
});

describe('chunk', () => {
  it('splits in order', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });
});
