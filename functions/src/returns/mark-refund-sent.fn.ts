import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { parseRefundSent, ReturnStepError } from './return-staff-step.js';
import { runReturnStep, type ReturnStepResult } from './return-staff-transaction.js';

/**
 * Refund Sent (admin only, ATS-293): Received → Refund Sent for a request with a refund. Saves the amount sent by InstaPay and an optional reference. No stock moves.
 */
export const markRefundSent = onCall(adminCallableOptions(), async (request): Promise<ReturnStepResult> => {
  const actor = await requireRole(request, 'admin');
  let input;
  try {
    input = parseRefundSent(request.data);
  } catch (error: unknown) {
    if (error instanceof ReturnStepError) throw new HttpsError(error.code, error.message);
    throw error;
  }
  return runReturnStep(getFirestore(), { step: 'refund-sent', input }, actor);
});
