import type { Firestore } from 'firebase-admin/firestore';
import { recountCatalog } from './catalog-counts.js';

export async function writeCatalogSummary(db: Firestore): Promise<void> {
  await recountCatalog(db);
}
