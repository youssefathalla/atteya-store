import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { parseReject, ReturnStepError } from './return-staff-step.js';
import { runReturnStep, type ReturnStepResult } from './return-staff-transaction.js';

/**
 * Reject (admin and staff, ATS-293): Requested or Approved → Rejected, with a reason the shopper sees. From Approved it undoes what Approve moved, once (`stockUndoneAt`).
 */
export const rejectReturnRequest = onCall(
  adminCallableOptions(),
  async (request): Promise<ReturnStepResult> => {
    const actor = await requireRole(request, 'staff');
    let input;
    try {
      input = parseReject(request.data);
    } catch (error: unknown) {
      if (error instanceof ReturnStepError) throw new HttpsError(error.code, error.message);
      throw error;
    }
    return runReturnStep(getFirestore(), { step: 'reject', input }, actor);
  },
);
