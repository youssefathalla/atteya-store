import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultWeightGrams, readCategoryWeight } from './catalog-taxonomy.js';

describe('defaultWeightGrams', () => {
  it('uses the built-in weights when nothing is saved', () => {
    assert.equal(defaultWeightGrams(['t-shirts', 'apparel']), 250);
    assert.equal(defaultWeightGrams(['socks']), 0);
    // Estimates for the padel gear until the client confirms them.
    assert.equal(defaultWeightGrams(['rackets', 'accessories']), 400);
    assert.equal(defaultWeightGrams(['bottles']), 200);
    assert.equal(defaultWeightGrams(['bags']), 900);
    // A parent category has no default of its own.
    assert.equal(defaultWeightGrams(['accessories']), null);
  });

  it('a weight saved on the category wins over the built-in one', () => {
    assert.equal(defaultWeightGrams(['bags'], 'Siux bag', { bags: 900 }), 900);
    assert.equal(defaultWeightGrams(['t-shirts'], 'Tee', { 't-shirts': 300 }), 300);
  });

  it('null on a category means no default there, and the parent is tried next', () => {
    assert.equal(defaultWeightGrams(['t-shirts'], 'Tee', { 't-shirts': null }), null);
    assert.equal(defaultWeightGrams(['grips', 'accessories'], 'Grip', { grips: null, accessories: 50 }), 50);
  });

  it('a jacket weighs 800 g in any category', () => {
    assert.equal(defaultWeightGrams(['tracksuits'], 'Nox Jacket Black', { tracksuits: 1200 }), 800);
  });
});

describe('readCategoryWeight', () => {
  it('keeps whole grams and null, and ignores anything else', () => {
    assert.equal(readCategoryWeight(0), 0);
    assert.equal(readCategoryWeight(900), 900);
    assert.equal(readCategoryWeight(null), null);
    assert.equal(readCategoryWeight(undefined), undefined);
    assert.equal(readCategoryWeight(-1), undefined);
    assert.equal(readCategoryWeight(12.5), undefined);
  });
});
