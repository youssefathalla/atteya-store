import * as v from 'valibot';
import { TimestampSchema } from '@shared/schemas/common.schema';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';

/** `customerNotes/{customerId}` (ATS-278): the private staff note on one customer. */
export const CUSTOMER_NOTES_COLLECTION = 'customerNotes';

/** Longest staff note (the rules check the same limit). */
export const CUSTOMER_NOTE_MAX_LENGTH = 1000;

/**
 * Written from the admin customer page by staff and admins (`canManageStore()` in the rules);
 * `updatedAt` is the server time and `updatedBy` the saver's uid.
 */
export const CustomerNoteSchema = v.object({
  note: v.fallback(v.string(), ''),
  updatedAt: v.fallback(v.nullable(TimestampSchema), null),
  updatedBy: v.fallback(v.string(), ''),
  updatedByEmail: v.fallback(v.string(), ''),
});

export type CustomerNote = v.InferOutput<typeof CustomerNoteSchema>;

export const customerNoteConverter = createValibotConverter(CustomerNoteSchema);
