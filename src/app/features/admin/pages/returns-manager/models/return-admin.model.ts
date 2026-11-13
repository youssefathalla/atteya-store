import * as v from 'valibot';
import { RETURN_KINDS, RETURN_STATUSES, type ReturnStatus } from '@core/config/returns';
import { timestampSchema } from '@shared/schemas';
import type { StatusConfig } from '@shared/ui/status-badge/status.model';

/** Where requests live (admin and staff read; only Cloud Functions write). */
export const RETURN_REQUESTS_COLLECTION = 'returnRequests';
/** Staff-only history of each request (`history`), written by the step callables. */
export const RETURN_STAFF_NOTES_COLLECTION = 'returnStaffNotes';

const whole = v.pipe(v.number(), v.integer(), v.minValue(0));
const text = v.optional(v.nullable(v.string()), null);
const selection = v.optional(v.record(v.string(), v.string()), {});

const ReturnItemSchema = v.object({
  lineIndex: whole,
  quantity: v.pipe(whole, v.minValue(1)),
  kind: v.picklist(RETURN_KINDS),
  reason: text,
  wants: text,
  refund: v.optional(v.boolean(), false),
  gift: v.optional(v.boolean(), false),
  autoGift: v.optional(v.boolean(), false),
  forLine: v.optional(v.nullable(whole), null),
  productId: v.string(),
  selection,
  name: v.optional(v.string(), ''),
  optionLabels: v.optional(v.array(v.object({ label: v.string(), value: v.string() })), []),
  imagePath: text,
  newProductId: text,
  newSelection: v.optional(v.nullable(v.record(v.string(), v.string())), null),
  sentProductId: text,
  sentSelection: v.optional(v.nullable(v.record(v.string(), v.string())), null),
  canBeSoldAgain: v.optional(v.nullable(v.boolean()), null),
  askedLabel: v.optional(v.string(), ''),
  refundEgp: v.optional(whole, 0),
});

export type ReturnItemDoc = v.InferOutput<typeof ReturnItemSchema>;

/** `returnRequests/{id}` as the admin reads it (ATS-291 writes it, the step callables move it). */
export const ReturnRequestSchema = v.object({
  id: v.string(),
  ref: v.string(),
  orderId: v.string(),
  orderRef: v.string(),
  status: v.picklist(RETURN_STATUSES),
  guest: v.optional(v.boolean(), false),
  customer: v.object({
    name: v.optional(v.string(), ''),
    phone: v.optional(v.string(), ''),
    email: text,
    country: v.optional(v.string(), 'EG'),
    line1: v.optional(v.string(), ''),
    line2: text,
    city: v.optional(v.string(), ''),
  }),
  items: v.array(ReturnItemSchema),
  note: text,
  refundTo: text,
  hasRefund: v.optional(v.boolean(), false),
  storeFault: v.optional(v.boolean(), false),
  itemsEgp: v.optional(whole, 0),
  feeEgp: v.optional(whole, 0),
  feePaid: v.optional(v.picklist(['free', 'off-refund', 'cash']), 'free'),
  refundEgp: v.optional(whole, 0),
  cashAtDoorEgp: v.optional(whole, 0),
  rejectReason: text,
  refundSentEgp: v.optional(v.nullable(whole), null),
  refundReference: text,
  stockNotReturned: v.optional(v.nullable(whole), null),
  createdAt: v.optional(v.nullable(timestampSchema), null),
  updatedAt: v.optional(v.nullable(timestampSchema), null),
});

export type ReturnRequestDoc = v.InferOutput<typeof ReturnRequestSchema>;

export const ReturnStaffNotesSchema = v.object({
  history: v.optional(
    v.array(
      v.object({
        status: v.picklist(RETURN_STATUSES),
        at: v.optional(v.nullable(timestampSchema), null),
        by: v.optional(v.string(), ''),
        byEmail: text,
        reason: text,
      }),
    ),
    [],
  ),
});

export type ReturnStaffNotes = v.InferOutput<typeof ReturnStaffNotesSchema>;

/** The status tabs, in the ticket's order. */
export type ReturnStatusFilter = ReturnStatus | 'all';

/** Status badge names and colours for requests (same names the shopper sees). */
export const RETURN_STATUS_CONFIG: Record<string, StatusConfig> = {
  requested: { label: 'Requested', color: 'yellow' },
  approved: { label: 'Approved', color: 'blue' },
  received: { label: 'Received', color: 'primary' },
  'refund-sent': { label: 'Refund Sent', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

/** What each step callable answers. */
export interface ReturnStepResult {
  readonly requestId: string;
  readonly status: ReturnStatus;
  readonly changed: boolean;
  readonly notReturned: number;
}

/** Live stock and size names of one product, for the request page and the Wrong Item picker. */
export interface ReturnProductLookup {
  readonly id: string;
  readonly name: string;
  readonly stock: number | null;
  readonly stockBySize: Readonly<Record<string, number>> | null;
  readonly sizes: readonly { readonly id: string; readonly label: string }[];
}
