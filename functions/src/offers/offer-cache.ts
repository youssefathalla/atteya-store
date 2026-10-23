import type { Firestore } from 'firebase-admin/firestore';
import type { Offer } from './engine/index.js';
import { parseOfferDoc } from './offer-schema.js';

const TTL_MS = 60_000;
let cachedAt = 0;
let cachedOffers: readonly Offer[] | null = null;

export function clearOfferCache(): void {
  cachedAt = 0;
  cachedOffers = null;
}

export async function getActiveOffers(
  db: Firestore,
  forceRefresh = false,
): Promise<readonly Offer[]> {
  const now = Date.now();
  if (!forceRefresh && cachedOffers && now - cachedAt < TTL_MS) {
    return cachedOffers;
  }

  const snap = await db
    .collection('offers')
    .where('active', '==', true)
    .limit(200)
    .get();

  const list: Offer[] = [];
  for (const doc of snap.docs) {
    const parsed = parseOfferDoc(doc.id, doc.data());
    if (parsed && !parsed.archived) {
      list.push(parsed);
    }
  }

  cachedOffers = list;
  cachedAt = now;
  return list;
}
