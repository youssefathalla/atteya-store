import { doc, getDoc, type Firestore } from 'firebase/firestore';
import * as v from 'valibot';
import { PublicCurrencySchema, type PublicCurrencyMap } from './currency.schema';

/** One-shot read of the public factor doc. The storefront never calls the rates API. */
export async function loadPublicCurrency(firestore: Firestore): Promise<PublicCurrencyMap | null> {
  try {
    const snap = await getDoc(doc(firestore, 'settings', 'currency'));
    if (!snap.exists()) return null;
    const parsed = v.safeParse(PublicCurrencySchema, snap.data());
    if (!parsed.success) return null;
    return parsed.output.currencies;
  } catch {
    return null;
  }
}
