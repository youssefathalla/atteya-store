import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { alreadyInCategory, movedCategoryIds, readMoveProductsRequest } from './move-products.js';

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
 * on each product, in one transaction with its audit entry, and locks `categoryIds` so catalogue
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
    // At most 200 products plus one audit entry: one transaction (Firestore allows 500 writes),
    // so the move and its audit entry land together or not at all.
    return db.runTransaction(async (tx) => {
      const categorySnap = await tx.get(categoryRef);
      if (!categorySnap.exists) {
        throw new HttpsError('not-found', 'That category no longer exists. Reload the page.');
      }
      const categoryIds = movedCategoryIds(categorySnap.data() ?? {}, input.categoryId);
      if (!categoryIds) {
        throw new HttpsError('failed-precondition', 'That category no longer exists. Reload the page.');
      }
      const snaps = await tx.getAll(...input.productIds.map((id) => products.doc(id)));
      const movedIds: string[] = [];
      const before: Record<string, { categoryId: unknown; categoryIds: unknown }> = {};
      let unchanged = 0;
      let missing = 0;
      for (const snap of snaps) {
        if (!snap.exists) {
          missing += 1;
          continue;
        }
        const data = snap.data() ?? {};
        if (alreadyInCategory(data, input.categoryId, categoryIds)) {
          unchanged += 1;
          continue;
        }
        before[snap.id] = {
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
        movedIds.push(snap.id);
      }
      if (movedIds.length > 0) {
        tx.create(db.collection('auditLogs').doc(), {
          action: 'products.moveCategory',
          actorUid: actor.uid,
          actorEmail: actor.email ?? actor.uid,
          targetId: input.categoryId,
          productIds: movedIds,
          before,
          at: FieldValue.serverTimestamp(),
        });
      }
      return { moved: movedIds.length, unchanged, missing };
    });
  },
);
