/**
 * Reads a saved `returnRequests/{id}` document (plus the order's view key) into the facts the
 * return emails need. Pure, so the templates and the choice of email are unit tested.
 */
import {
  isReturnKind,
  isReturnStatus,
  timestampMs,
  type CourierFeePaid,
  type ReturnKind,
  type ReturnStatus,
} from '../store/returns.js';

export interface ReturnEmailItem {
  readonly lineIndex: number;
  readonly quantity: number;
  readonly kind: ReturnKind;
  readonly refund: boolean;
  /** A gift added by the server: it comes back with the refunded item on line `forLine`. */
  readonly autoGift: boolean;
  readonly forLine: number | null;
  readonly name: string;
  readonly optionLabels: readonly { readonly label: string; readonly value: string }[];
  readonly imagePath: string | null;
  /** `Size M → L`, `Return · Didn't fit`, `Damaged · Send Another`. */
  readonly askedLabel: string;
  readonly refundEgp: number;
}

export interface ReturnEmailRequest {
  readonly id: string;
  /** `#R-A1B2C3`. */
  readonly ref: string;
  readonly orderId: string;
  /** `#A1B2C3`. */
  readonly orderRef: string;
  readonly status: ReturnStatus;
  readonly customer: {
    readonly name: string;
    readonly phone: string;
    readonly email: string | null;
    readonly guest: boolean;
    readonly country: string;
    readonly line1: string;
    readonly line2: string | null;
    readonly city: string;
  };
  readonly items: readonly ReturnEmailItem[];
  readonly note: string | null;
  readonly refundTo: string | null;
  readonly hasRefund: boolean;
  /** Any item is Damaged or Wrong Item Sent. */
  readonly storeFault: boolean;
  readonly itemsEgp: number;
  readonly feeEgp: number;
  readonly feePaid: CourierFeePaid;
  readonly refundEgp: number;
  readonly cashAtDoorEgp: number;
  /** Staff's reason when the request is Rejected (shown to the shopper). */
  readonly rejectReason: string | null;
  /** What staff sent at Refund Sent; the planned `refundEgp` before that. */
  readonly refundSentEgp: number;
  /** The InstaPay reference staff saved with Refund Sent, if any. */
  readonly refundReference: string | null;
  readonly createdAtMs: number | null;
  readonly deliveredAtMs: number | null;
  /** The order's secret view key, for a guest's "View Your Order" link; null for signed-in orders. */
  readonly viewKey: string | null;
}

/** Null when the document can't be described (no items or unknown status). */
export function readReturnForEmail(
  requestId: string,
  data: Readonly<Record<string, unknown>> | null | undefined,
  viewKey: string | null,
): ReturnEmailRequest | null {
  if (!data) return null;
  const status = data['status'];
  if (!isReturnStatus(status)) return null;
  const orderId = text(data['orderId']);
  if (!orderId) return null;
  const items: ReturnEmailItem[] = [];
  for (const raw of Array.isArray(data['items']) ? data['items'] : []) {
    if (!isRecord(raw)) continue;
    const kind = raw['kind'];
    const quantity = whole(raw['quantity']);
    if (!isReturnKind(kind) || quantity < 1) continue;
    items.push({
      lineIndex: whole(raw['lineIndex']),
      quantity,
      kind,
      refund: raw['refund'] === true,
      autoGift: raw['autoGift'] === true,
      forLine: typeof raw['forLine'] === 'number' ? whole(raw['forLine']) : null,
      name: text(raw['name']),
      optionLabels: readOptionLabels(raw['optionLabels']),
      imagePath: text(raw['imagePath']) || null,
      askedLabel: text(raw['askedLabel']),
      refundEgp: whole(raw['refundEgp']),
    });
  }
  if (items.length === 0) return null;
  const customer = isRecord(data['customer']) ? data['customer'] : {};
  const email = text(customer['email']);
  const feePaid = data['feePaid'];
  return {
    id: requestId,
    ref: text(data['ref']) || `#R-${requestId.slice(0, 6).toUpperCase()}`,
    orderId,
    orderRef: text(data['orderRef']) || `#${orderId.slice(0, 6).toUpperCase()}`,
    status,
    customer: {
      name: text(customer['name']),
      phone: text(customer['phone']),
      email: email.includes('@') ? email : null,
      guest: customer['guest'] === true,
      country: text(customer['country']) || 'EG',
      line1: text(customer['line1']),
      line2: text(customer['line2']) || null,
      city: text(customer['city']),
    },
    items,
    note: text(data['note']) || null,
    refundTo: text(data['refundTo']) || null,
    hasRefund: data['hasRefund'] === true,
    storeFault: data['storeFault'] === true,
    itemsEgp: whole(data['itemsEgp']),
    feeEgp: whole(data['feeEgp']),
    feePaid: feePaid === 'off-refund' || feePaid === 'cash' ? feePaid : 'free',
    refundEgp: whole(data['refundEgp']),
    cashAtDoorEgp: whole(data['cashAtDoorEgp']),
    rejectReason: text(data['rejectReason']) || null,
    refundSentEgp:
      typeof data['refundSentEgp'] === 'number' ? whole(data['refundSentEgp']) : whole(data['refundEgp']),
    refundReference: text(data['refundReference']) || null,
    createdAtMs: timestampMs(data['createdAt']),
    deliveredAtMs: timestampMs(data['orderDeliveredAt']),
    viewKey: viewKey || null,
  };
}

function readOptionLabels(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; value: string }[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const label = text(entry['label']);
    const value = text(entry['value']);
    if (label && value) out.push({ label, value });
  }
  return out;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function whole(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
