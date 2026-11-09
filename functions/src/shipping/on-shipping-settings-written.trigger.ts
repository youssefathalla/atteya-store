import { FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

interface ShippingAuditSnapshot {
  readonly egyptBoxFees: readonly number[] | null;
  readonly internationalBoxFees: readonly number[] | null;
  readonly freeOver: { readonly active: boolean; readonly threshold: number | null } | null;
  readonly promoActive: boolean;
}

export const onShippingSettingsWritten = onDocumentWritten(
  { document: 'settings/shipping', region: 'europe-west3', retry: false },
  async (event) => {
    const before = event.data?.before.exists ? (event.data.before.data() ?? null) : null;
    const after = event.data?.after.exists ? (event.data.after.data() ?? null) : null;
    if (!before && !after) return;

    const action = !before ? 'shipping.create' : !after ? 'shipping.delete' : 'shipping.update';

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
    egyptBoxFees: readBoxFees(data['egyptBoxes']),
    internationalBoxFees: readBoxFees(data['internationalBoxes']),
    freeOver: readFreeOver(data['freeOver']),
    promoActive: readPromoActive(data['promo']),
  };
}

function readBoxFees(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const fees: number[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const fee = (entry as Record<string, unknown>)['feeEgp'];
    if (typeof fee === 'number' && Number.isFinite(fee)) fees.push(Math.round(fee));
  }
  return fees.length > 0 ? fees : null;
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
