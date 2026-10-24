import assert from 'node:assert/strict';
import test from 'node:test';
import type { Firestore } from 'firebase-admin/firestore';
import type { SearchClient } from 'algoliasearch';
import { executeProductSearchSync } from './sync-product.trigger.js';

test('when getCatalogLookup rejects, searchSyncErrors is written with saveObject for a published product', async () => {
  const written: { op?: string; message?: string } = {};
  const db = {
    collection: (name: string) => {
      assert.equal(name, 'searchSyncErrors');
      return {
        doc: (id: string) => {
          assert.equal(id, 'product-1');
          return {
            set: async (data: { op: string; message: string }) => {
              written.op = data.op;
              written.message = data.message;
            },
            delete: async () => {
              throw new Error('delete should not run');
            },
          };
        },
      };
    },
  } as unknown as Firestore;

  await executeProductSearchSync(
    db,
    'product-1',
    null,
    { published: true, name: 'Test' },
    {
      getCatalogLookup: async () => {
        throw new Error('catalog read failed');
      },
      getActiveOffers: async () => [],
      getSearchClient: () => {
        throw new Error('Algolia client should not be requested');
      },
      productsIndexName: () => 'dev_products',
      withRetry: async () => {
        throw new Error('withRetry should not run');
      },
    },
  );

  assert.equal(written.op, 'saveObject');
  assert.match(written.message ?? '', /catalog read failed/);
});

test('when getCatalogLookup rejects on unpublish, searchSyncErrors uses deleteObject', async () => {
  const written: { op?: string } = {};
  const db = {
    collection: () => ({
      doc: () => ({
        set: async (data: { op: string }) => {
          written.op = data.op;
        },
        delete: async () => {},
      }),
    }),
  } as unknown as Firestore;

  await executeProductSearchSync(
    db,
    'product-2',
    { published: true, name: 'Was live' },
    { published: false, name: 'Was live' },
    {
      getCatalogLookup: async () => {
        throw new Error('catalog down');
      },
      getActiveOffers: async () => [],
      getSearchClient: () => ({}) as SearchClient,
      productsIndexName: () => 'dev_products',
      withRetry: async <T>(op: () => Promise<T>) => op(),
    },
  );

  assert.equal(written.op, 'deleteObject');
});
