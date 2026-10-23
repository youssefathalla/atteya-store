import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

interface ShippingAuditSnapshot {
  readonly baseFee: number | null;
  readonly freeOver: { readonly active: boolean; readonly threshold: number | null } | null;
  readonly promoActive: boolean;
}

export const onShippingSettingsWritten = onDocumentWritten(
  { document: 'settings/shipping', region: 'europe-west3', retry: false },
  async (event) => {
    const before = event.data?.before.exists ? (event.data.before.data() ?? null) : null;
    const after = event.data?.after.exists ? (event.data.after.data() ?? null) : null;
    if (!before && !after) return;

    const action = !before
      ? 'shipping.create'
      : !after
        ? 'shipping.delete'
        : 'shipping.update';

    const actorUid =
      (typeof after?.['updatedBy'] === 'string' && after['updatedBy']) ||
      (typeof before?.['updatedBy'] === 'string' && before['updatedBy']) ||
      'admin';

    await getFirestore()
      .collection('auditLogs')
      .doc()
      .set({
        action,
        actorUid,
        at: FieldValue.serverTimestamp(),
        changed: listChangedFields(before, after),
        before: shippingAuditSnapshot(before),
        after: shippingAuditSnapshot(after),
      });
  },
);

function shippingAuditSnapshot(data: DocumentData | null): ShippingAuditSnapshot | null {
  if (!data) return null;
  return {
    baseFee: typeof data['baseFee'] === 'number' ? data['baseFee'] : null,
    freeOver: readFreeOver(data['freeOver']),
    promoActive: readPromoActive(data['promo']),
  };
}

function readFreeOver(
  value: unknown,
): { readonly active: boolean; readonly threshold: number | null } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    active: record['active'] === true,
    threshold: typeof record['threshold'] === 'number' ? record['threshold'] : null,
  };
}

function readPromoActive(promo: unknown): boolean {
  if (!promo || typeof promo !== 'object') return false;
  return (promo as Record<string, unknown>)['active'] === true;
}

function listChangedFields(before: DocumentData | null, after: DocumentData | null): string[] {
  const keys = new Set<string>();
  for (const key of Object.keys(before ?? {})) keys.add(key);
  for (const key of Object.keys(after ?? {})) keys.add(key);
  keys.delete('updatedBy');
  keys.delete('updatedAt');

  const changed: string[] = [];
  for (const key of [...keys].sort()) {
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) {
      changed.push(key);
    }
  }
  return changed;
}
