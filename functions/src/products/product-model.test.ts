import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  colourSizes,
  colourSlugBase,
  contentVersion,
  modelGroupFromName,
  parseSaveProductModelRequest,
  sharedSizeIds,
} from '../../lib/products/product-model.js';

const shared = {
  name: 'Bullpadel Padel Shorts',
  summary: 'Light quick-dry padel shorts',
  description: 'Light shorts.',
  details: ['Quick-dry fabric'],
  type: 'shorts',
  categoryId: 'shorts',
  brandId: 'bullpadel',
  gender: 'men',
  weightGrams: 250,
  tags: [],
  marketingBadge: null,
  newArrivalUntil: null,
  price: 599,
  compareAtPrice: 800,
  sizes: [{ id: 's', label: 'S' }, { id: 'm', label: 'M' }, { label: 'L' }],
};

const colour = (overrides: Record<string, unknown> = {}) => ({
  productId: 'AAAAAAAAAAAAAAAAAAAA',
  version: null,
  colors: ['green'],
  images: [],
  published: false,
  ownPrice: null,
  stock: [1, 2, 0],
  made: [true, true, true],
  ...overrides,
});

describe('product model request', () => {
  it('reads a new product with one colour', () => {
    const request = parseSaveProductModelRequest({ anchorId: null, shared, colours: [colour()] });
    assert.equal(request.anchorId, null);
    assert.equal(request.colours.length, 1);
    assert.equal(request.shared.sizes.length, 3);
  });

  it('refuses a colour that is made in no size', () => {
    assert.throws(
      () =>
        parseSaveProductModelRequest({
          anchorId: null,
          shared,
          colours: [colour({ made: [false, false, false] })],
        }),
      /at least one size/,
    );
  });

  it('refuses stock that does not line up with the sizes', () => {
    assert.throws(
      () => parseSaveProductModelRequest({ anchorId: null, shared, colours: [colour({ stock: [1, 2] })] }),
      /Reload the page/,
    );
  });

  it('refuses a saved colour while creating', () => {
    assert.throws(
      () =>
        parseSaveProductModelRequest({
          anchorId: null,
          shared,
          colours: [colour({ version: 'a'.repeat(64), productId: 'eo-123' })],
        }),
      /Reload the page/,
    );
  });

  it('needs the opened product among the colours', () => {
    assert.throws(
      () =>
        parseSaveProductModelRequest({
          anchorId: 'other',
          shared,
          colours: [colour({ version: 'a'.repeat(64), productId: 'eo-123' })],
        }),
      /Reload the page/,
    );
  });

  it('keeps a saved colour with no colour or the same colour as another', () => {
    const saved = (productId: string, colors: string[]) =>
      colour({ productId, version: 'b'.repeat(64), colors });
    const request = parseSaveProductModelRequest({
      anchorId: 'eo-1',
      shared,
      colours: [saved('eo-1', []), saved('eo-2', ['black']), saved('eo-3', ['black'])],
    });
    assert.equal(request.colours.length, 3);
  });

  it('refuses the same colour twice', () => {
    assert.throws(
      () =>
        parseSaveProductModelRequest({
          anchorId: null,
          shared,
          colours: [colour(), colour({ productId: 'BBBBBBBBBBBBBBBBBBBB' })],
        }),
      /only be added once/,
    );
  });

  it('refuses a shown colour with no photos', () => {
    assert.throws(
      () => parseSaveProductModelRequest({ anchorId: null, shared, colours: [colour({ published: true })] }),
      /at least one photo/,
    );
  });

  it('refuses an own old price that is not above the own price', () => {
    assert.throws(
      () =>
        parseSaveProductModelRequest({
          anchorId: null,
          shared,
          colours: [colour({ ownPrice: { price: 700, compareAtPrice: 650 } })],
        }),
      /original price/,
    );
  });
});

describe('product model helpers', () => {
  it('changes the version on any saved field but not on the colour list', () => {
    const base = { name: 'Shorts', stock: 3, colorSiblings: [{ id: 'a' }] };
    const version = contentVersion(base);
    assert.match(version, /^[a-f0-9]{64}$/);
    assert.equal(contentVersion({ colorSiblings: [{ id: 'b' }], stock: 3, name: 'Shorts' }), version);
    assert.notEqual(contentVersion({ ...base, stock: 2 }), version);
  });

  it('reads timestamps to the nanosecond', () => {
    const time = (nanoseconds: number) => ({ seconds: 1, nanoseconds, toMillis: () => 1000 });
    assert.notEqual(contentVersion({ updatedAt: time(1) }), contentVersion({ updatedAt: time(2) }));
  });

  it('makes a model name like link-colour-models.mjs', () => {
    assert.equal(modelGroupFromName('  Héad Padel Shorts! '), 'head-padel-shorts');
    assert.equal(modelGroupFromName('***'), 'product');
  });

  it('adds the colour to a new colour slug only when there are several colours', () => {
    assert.equal(colourSlugBase('Bullpadel Padel Shorts', 'green', true), 'bullpadel-padel-shorts-green');
    assert.equal(
      colourSlugBase('Bullpadel Padel Shorts', 'light-blue', true),
      'bullpadel-padel-shorts-light-blue',
    );
    assert.equal(colourSlugBase('Babolat Bottle', 'black', false), 'babolat-bottle');
  });

  it('keeps saved size ids and names new ones from the label', () => {
    assert.deepEqual(sharedSizeIds([{ id: 'm', label: 'M' }, { label: 'XL' }, { label: 'm' }]), [
      'm',
      'xl',
      'm-2',
    ]);
  });

  it('leaves out sizes a colour is not made in and keeps other options', () => {
    const live = [
      {
        key: 'size',
        label: 'Size',
        values: [
          { id: 's', label: 'S' },
          { id: 'm', label: 'M' },
        ],
      },
      { key: 'grip', label: 'Grip', values: [{ id: 'g1', label: 'G1' }] },
    ];
    const sizes = [{ id: 's', label: 'S' }, { id: 'm', label: 'M' }, { label: 'L' }];
    const result = colourSizes(live, sizes, ['s', 'm', 'l'], { stock: [3, 4, 5], made: [true, false, true] });
    assert.deepEqual(result.stockBySize, { s: 3, l: 5 });
    assert.deepEqual(
      result.options.map((option) => [option.key, option.values.map((value) => value.id)]),
      [
        ['size', ['s', 'l']],
        ['grip', ['g1']],
      ],
    );
  });

  it('keeps a colour’s own id for a size with the same name', () => {
    const live = [{ key: 'size', label: 'Size', values: [{ id: 'medium', label: 'M' }] }];
    const result = colourSizes(live, [{ id: 'm', label: 'M' }], ['m'], { stock: [2], made: [true] });
    assert.deepEqual(result.stockBySize, { medium: 2 });
  });

  it('uses one number when the product has no sizes', () => {
    const live = [{ key: 'size', label: 'Size', values: [{ id: 's', label: 'S' }] }];
    const result = colourSizes(live, [], [], { stock: [7], made: [] });
    assert.equal(result.stockBySize, null);
    assert.equal(result.flatStock, 7);
    assert.deepEqual(result.options, []);
  });
});
