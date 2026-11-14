import type { ReturnStatus } from '../store/returns.js';
import type { ReturnEmailRequest } from './return-email-model.js';

/**
 * The emails a return request can send (ATS-291, ATS-294). Each is sent at most once per request
 * (`returnEmails/{requestId}_{kind}` in the trigger).
 */
export type ReturnEmailKind =
  /** Staff alert: a shopper sent a return or exchange request. */
  | 'store-return-request'
  /** Shopper: "Request Sent". */
  | 'return-requested'
  /** Shopper: "Request Approved" (Requested → Approved). */
  | 'return-approved'
  /** Shopper: "We Can't Take It Back" (Requested or Approved → Rejected). */
  | 'return-rejected'
  /** Shopper: "Items Received" (Approved → Received). */
  | 'return-received'
  /** Shopper: "Refund Sent" (Received → Refund Sent). */
  | 'return-refund-sent';

/** `returnEmails` document id: one per (request, email). */
export function returnClaimId(kind: ReturnEmailKind, request: Pick<ReturnEmailRequest, 'id'>): string {
  return `${request.id}_${kind}`;
}

/**
 * The shopper email each staff step sends, keyed by the new status, with the statuses it may come
 * from. Any other change (a step back, the same status written again, Cancelled) sends nothing.
 */
const STATUS_EMAILS: Partial<
  Record<ReturnStatus, { readonly kind: ReturnEmailKind; readonly from: readonly ReturnStatus[] }>
> = {
  approved: { kind: 'return-approved', from: ['requested'] },
  rejected: { kind: 'return-rejected', from: ['requested', 'approved'] },
  received: { kind: 'return-received', from: ['approved'] },
  'refund-sent': { kind: 'return-refund-sent', from: ['received'] },
};

/**
 * A new request (created as Requested) sends the staff alert and the shopper's "Request Sent".
 * A staff step forward sends the matching shopper email (`STATUS_EMAILS`). A Refund Sent of
 * EGP 0 (the courier fee used up the refund) sends nothing: the Received email already said so.
 */
export function returnEmailsForWrite(
  before: Pick<ReturnEmailRequest, 'status'> | null,
  after: Pick<ReturnEmailRequest, 'status' | 'refundSentEgp'> | null,
): ReturnEmailKind[] {
  if (!after) return [];
  if (before === null) {
    return after.status === 'requested' ? ['store-return-request', 'return-requested'] : [];
  }
  if (before.status === after.status) return [];
  const step = STATUS_EMAILS[after.status];
  if (!step || !step.from.includes(before.status)) return [];
  if (step.kind === 'return-refund-sent' && after.refundSentEgp <= 0) return [];
  return [step.kind];
}
