import type { IndexSettings } from 'algoliasearch';
import { replicaNames } from './algolia-config.js';

export const SEARCHABLE_ATTRIBUTES: readonly string[] = [
  'name',
  'brandName',
  'unordered(playerNames)',
  'unordered(typeLabel)',
  'unordered(hierarchicalCategories.lvl1)',
  'unordered(hierarchicalCategories.lvl0)',
];

export const ATTRIBUTES_FOR_FACETING: readonly string[] = [
  'brandName',
  'typeLabel',
  'sizes',
  'colors',
  'onSale',
  'hasOffer',
  'maxDiscountPercent',
  'hierarchicalCategories.lvl0',
  'hierarchicalCategories.lvl1',
  'filterOnly(categoryIds)',
  'filterOnly(brandId)',
  'filterOnly(type)',
  'filterOnly(modelGroup)',
  // Shop's Player filter (`?player=<id>`) lists the ids that have published products, with counts.
  'players',
  // Shop needs facet counts to show/hide the Gender filter (AS-74); filterOnly omits values.
  'gender',
  'filterOnly(marketingBadgeKind)',
  'filterOnly(inStock)',
  'filterOnly(offerIds)',
  // Shop's New arrivals filter: `newArrivalUntilMs > <now>` (0 = not a new arrival).
  'filterOnly(newArrivalUntilMs)',
  'price',
  'displayPrice',
];

export const CUSTOM_RANKING: readonly string[] = ['desc(inStock)', 'desc(createdAtMs)'];

export function primaryIndexSettings(indexName: string): IndexSettings {
  const replicas = replicaNames(indexName);
  return {
    searchableAttributes: [...SEARCHABLE_ATTRIBUTES],
    attributesForFaceting: [...ATTRIBUTES_FOR_FACETING],
    customRanking: [...CUSTOM_RANKING],
    // One result per model (`distinctKey`): the best-ranked colour of each model is shown, so an
    // in-stock colour wins (`desc(inStock)`), and a Colour filter shows the matching colour.
    attributeForDistinct: 'distinctKey',
    distinct: 1,
    replicas: [...replicas.all],
    queryLanguages: ['en'],
    ignorePlurals: true,
    removeStopWords: true,
    attributesToHighlight: ['name'],
    hitsPerPage: 24,
  };
}

export function replicaRanking(direction: 'asc' | 'desc'): string[] {
  return [
    `${direction}(displayPrice)`,
    'typo',
    'geo',
    'words',
    'filters',
    'proximity',
    'attribute',
    'exact',
    'custom',
  ];
}

export function replicaIndexSettings(direction: 'asc' | 'desc'): IndexSettings {
  return {
    ranking: replicaRanking(direction),
  };
}
