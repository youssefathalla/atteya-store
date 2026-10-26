import { defineSecret, defineString } from 'firebase-functions/params';
import { currentProjectId } from '../project-id.js';

/**
 * Optional override for the Algolia Application ID. When left blank, the App ID
 * is resolved from the active Firebase project ID (`atteya-store-dev` or `attiya-store`).
 */
export const ALGOLIA_APP_ID = defineString('ALGOLIA_APP_ID', {
  default: '',
  description: 'Optional override for the public Algolia Application ID.',
});

/**
 * Server-side Algolia Write API key stored in Google Cloud Secret Manager.
 * Never place this key in .env files, Angular environments, or logs.
 */
export const ALGOLIA_WRITE_KEY = defineSecret('ALGOLIA_WRITE_KEY');

const APP_ID_BY_PROJECT: Readonly<Record<string, string>> = {
  'atteya-store-dev': 'VP2KAG5WKX',
  'attiya-store': 'EW50BE3MCR',
};

const INDEX_BY_PROJECT: Readonly<Record<string, string>> = {
  'atteya-store-dev': 'dev_products',
  'attiya-store': 'prod_products',
};

export function algoliaAppId(): string {
  const override = ALGOLIA_APP_ID.value().trim();
  if (override) return override;
  const project = currentProjectId();
  const appId = APP_ID_BY_PROJECT[project];
  if (!appId) {
    throw new Error(`Unknown project for Algolia App ID: "${project}".`);
  }
  return appId;
}

export function productsIndexName(): string {
  const project = currentProjectId();
  const indexName = INDEX_BY_PROJECT[project];
  if (!indexName) {
    throw new Error(`Unknown project for search index: "${project}".`);
  }
  return indexName;
}

export interface ReplicaIndexNames {
  readonly priceAsc: string;
  readonly priceDesc: string;
  readonly all: readonly [string, string];
}

export function replicaNames(indexName: string): ReplicaIndexNames {
  const priceAsc = `${indexName}_price_asc`;
  const priceDesc = `${indexName}_price_desc`;
  return {
    priceAsc,
    priceDesc,
    all: [priceAsc, priceDesc],
  };
}
