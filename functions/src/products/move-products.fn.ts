import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import {
  alreadyInCategory,
  chunk,
  MOVE_BATCH_SIZE,
  movedCategoryIds,
  readMoveProductsRequest,
} from './move-products.js';

export interface MoveProductsToCategoryResponse {
  /** Products whose category changed. */
  readonly moved: number;
  /** Products that were already in that category. */
  readonly unchanged: number;
  /** Ids that no longer exist (deleted while the list was open). */
  readonly missing: number;
}

/**
 * Move to Category on the admin Products list (ATS-266). Sets `categoryId` and `categoryIds`
 * on each product, in transactions of up to 100 products, and locks `categoryIds` so catalogue
 * tools never put it back. Weight, size chart and every other field stay as saved; counts,
 * search records and colour siblings follow through their triggers.
 */
export const moveProductsToCategory = onCall(
  adminCallableOptions({ timeoutSeconds: 120 }),
  async (request): Promise<MoveProductsToCategoryResponse> => {
    const actor = await requireRole(request, 'staff');
    const input = readMoveProductsRequest(request.data);
    if (typeof input === 'string') throw new HttpsError('invalid-argument', input);

    const db = getFirestore();
    const categoryRef = db.collection('categories').doc(input.categoryId);
    const products = db.collection('products');
    let moved = 0;
    let unchanged = 0;
    let missing = 0;
    const movedIds: string[] = [];
    const before: Record<string, { categoryId: unknown; categoryIds: unknown }> = {};

    for (const ids of chunk(input.productIds, MOVE_BATCH_SIZE)) {
      const result = await db.runTransaction(async (tx) => {
        const categorySnap = await tx.get(categoryRef);
        if (!categorySnap.exists) {
          throw new HttpsError('not-found', 'That category no longer exists. Reload the page.');
        }
        const categoryIds = movedCategoryIds(categorySnap.data() ?? {}, input.categoryId);
        if (!categoryIds) {
          throw new HttpsError('failed-precondition', 'That category no longer exists. Reload the page.');
        }
        const snaps = await tx.getAll(...ids.map((id) => products.doc(id)));
        const batch = { moved: [] as string[], unchanged: 0, missing: 0, before: {} as typeof before };
        for (const snap of snaps) {
          if (!snap.exists) {
            batch.missing += 1;
            continue;
          }
          const data = snap.data() ?? {};
          if (alreadyInCategory(data, input.categoryId, categoryIds)) {
            batch.unchanged += 1;
            continue;
          }
          batch.before[snap.id] = {
            categoryId: data['categoryId'] ?? null,
            categoryIds: data['categoryIds'] ?? null,
          };
          tx.update(snap.ref, {
            categoryId: input.categoryId,
            categoryIds,
            // `categoryIds` is the lockable field that also guards `categoryId` (LOCKABLE_FIELDS).
            lockedFields: FieldValue.arrayUnion('categoryIds'),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actor.uid,
          });
          batch.moved.push(snap.id);
        }
        return batch;
      });
      moved += result.moved.length;
      movedIds.push(...result.moved);
      unchanged += result.unchanged;
      missing += result.missing;
      Object.assign(before, result.before);
    }

    if (moved > 0) {
      await db.collection('auditLogs').add({
        action: 'products.moveCategory',
        actorUid: actor.uid,
        actorEmail: actor.email ?? actor.uid,
        targetId: input.categoryId,
        productIds: movedIds,
        before,
        at: FieldValue.serverTimestamp(),
      });
    }
    return { moved, unchanged, missing };
  },
);
