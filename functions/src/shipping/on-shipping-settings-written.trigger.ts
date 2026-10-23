import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const onShippingSettingsWritten = onDocumentWritten(
  { document: 'settings/shipping', region: 'europe-west3', retry: false },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    if (!after) return;

    const actorUid =
      typeof after['updatedBy'] === 'string' && after['updatedBy'] ? after['updatedBy'] : 'admin';

    await getFirestore()
      .collection('auditLogs')
      .doc()
      .set({
        action: before ? 'shipping.update' : 'shipping.create',
        actorUid,
        baseFee: typeof after['baseFee'] === 'number' ? after['baseFee'] : null,
        at: FieldValue.serverTimestamp(),
      });
  },
);
