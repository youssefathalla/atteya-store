import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  clearColorSiblings,
  colorSiblingsNeedRefresh,
  readModelGroup,
  refreshColorSiblings,
} from './color-siblings.js';

/**
 * Keeps `colorSiblings` (the other colours shown on product cards) current on every product
 * of a model whenever one of them is created, edited, published, unpublished, restocked or
 * deleted. `syncProductSearch` then mirrors the new list to Algolia.
 */
export const onProductColorSiblingsChange = onDocumentWritten(
  { document: 'products/{productId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!colorSiblingsNeedRefresh(before, after)) return;

    const db = getFirestore();
    const productId = event.params.productId;
    const groups = new Set<string>();
    const beforeGroup = readModelGroup(before);
    const afterGroup = readModelGroup(after);
    if (beforeGroup) groups.add(beforeGroup);
    if (afterGroup) groups.add(afterGroup);

    try {
      if (after && afterGroup === null && after['colorSiblings'] !== undefined) {
        await clearColorSiblings(db, productId);
      }
      for (const group of groups) {
        await refreshColorSiblings(db, group);
      }
    } catch (error: unknown) {
      logger.error('Could not update product colour lists', {
        productId,
        groups: [...groups],
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
