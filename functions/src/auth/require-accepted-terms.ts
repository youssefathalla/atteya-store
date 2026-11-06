import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { hasAcceptedTerms } from './accepted-terms.js';

/** Shopper callables that create an account-linked record (orders) call this after `requireRole`. */
export async function requireAcceptedTerms(uid: string): Promise<void> {
  const snap = await getFirestore().collection('users').doc(uid).get();
  if (hasAcceptedTerms(snap.data())) return;
  throw new HttpsError(
    'failed-precondition',
    'Agree to the Terms and Conditions and Privacy Policy before placing your order.',
  );
}
