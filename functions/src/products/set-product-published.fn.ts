import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { publishBlockedReason, readSetProductPublishedRequest } from './product-published.js';

export interface SetProductPublishedResponse {
  readonly published: boolean;
}

/** Live / Hidden switch on the admin Products list. */
export const setProductPublished = onCall(
  adminCallableOptions(),
  async (request): Promise<SetProductPublishedResponse> => {
    const actor = await requireRole(request, 'staff');
    const input = readSetProductPublishedRequest(request.data);
    if (typeof input === 'string') throw new HttpsError('invalid-argument', input);

    const db = getFirestore();
    const ref = db.collection('products').doc(input.productId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'This product no longer exists. Reload the page.');
      }
      const data = snap.data() ?? {};
      const blocked = publishBlockedReason(input.published, data['images']);
      if (blocked) throw new HttpsError('failed-precondition', blocked);
      if (data['published'] === input.published) return { published: input.published };
      // No auditLogs entry yet, same as setProductStock.
      tx.update(ref, {
        published: input.published,
        // Same as the product editor: staff's choice must not be overwritten by catalogue tools.
        lockedFields: FieldValue.arrayUnion('published'),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      return { published: input.published };
    });
  },
);
