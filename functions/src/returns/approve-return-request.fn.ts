import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { parseApprove, ReturnStepError } from './return-staff-step.js';
import { runReturnStep, type ReturnStepResult } from './return-staff-transaction.js';

/**
 * Approve (admin and staff, ATS-293): Requested → Approved. For Wrong Item Sent it saves the piece we actually sent (`sent`), then takes the new pieces out of stock in the same transaction (`runReturnStep`). A sold-out piece refuses and nothing changes.
 */
export const approveReturnRequest = onCall(
  adminCallableOptions(),
  async (request): Promise<ReturnStepResult> => {
    const actor = await requireRole(request, 'staff');
    let input;
    try {
      input = parseApprove(request.data);
    } catch (error: unknown) {
      if (error instanceof ReturnStepError) throw new HttpsError(error.code, error.message);
      throw error;
    }
    return runReturnStep(getFirestore(), { step: 'approve', input }, actor);
  },
);
