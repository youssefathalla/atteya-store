import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { parseReceive, ReturnStepError } from './return-staff-step.js';
import { runReturnStep, type ReturnStepResult } from './return-staff-transaction.js';

/**
 * Item Received (admin and staff, ATS-293): Approved → Received. Puts the returned pieces staff mark as Can be sold again back into stock, once (`stockReturnedAt`). Exchange-only requests are done here.
 */
export const receiveReturnRequest = onCall(
  adminCallableOptions(),
  async (request): Promise<ReturnStepResult> => {
    const actor = await requireRole(request, 'staff');
    let input;
    try {
      input = parseReceive(request.data);
    } catch (error: unknown) {
      if (error instanceof ReturnStepError) throw new HttpsError(error.code, error.message);
      throw error;
    }
    return runReturnStep(getFirestore(), { step: 'receive', input }, actor);
  },
);
