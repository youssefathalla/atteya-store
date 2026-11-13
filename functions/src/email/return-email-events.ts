import type { ReturnEmailRequest } from './return-email-model.js';

/**
 * The emails a return request can send (ATS-291). The Approved, Rejected, Received and Refund
 * Sent emails come in ATS-294. Each is sent at most once per request
 * (`returnEmails/{requestId}_{kind}` in the trigger).
 */
export type ReturnEmailKind =
  /** Staff alert: a shopper sent a return or exchange request. */
  | 'store-return-request'
  /** Shopper: "Request Sent". */
  | 'return-requested';

/** `returnEmails` document id: one per (request, email). */
export function returnClaimId(kind: ReturnEmailKind, request: Pick<ReturnEmailRequest, 'id'>): string {
  return `${request.id}_${kind}`;
}

/** A new request (created as Requested) sends the staff alert and the shopper's "Request Sent". */
export function returnEmailsForWrite(
  before: Pick<ReturnEmailRequest, 'status'> | null,
  after: Pick<ReturnEmailRequest, 'status'> | null,
): ReturnEmailKind[] {
  if (!after) return [];
  if (before === null && after.status === 'requested') return ['store-return-request', 'return-requested'];
  return [];
}
