/**
 * Read-only check: lists every product that still has an old "gift" option from the old store
 * (key `gift`, or an option label starting with "Free", such as "Free shirt" / "Free socks").
 * Those show on the product page as plain text buttons instead of the Gift Box, and the shirt or
 * socks picked there is only a label, not a real free product. They belong in a Free gift offer:
 * add the product to `BAGS` in `move-bag-gifts-to-offer.mjs` (match each choice to its product by
 * photo) and run that script.
 *
 * For each product found it prints the option labels and choices, and the Free gift offers that
 * already cover it. Writes nothing.
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/check-gift-options.mjs --project atteya-store-dev
 *   node scripts/check-gift-options.mjs --project attiya-store
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const index = process.argv.indexOf('--project');
const projectId = index === -1 ? undefined : process.argv[index + 1];
if (!['atteya-store-dev', 'attiya-store'].includes(projectId)) {
  throw new Error('--project must be atteya-store-dev or attiya-store');
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const isGiftOption = (option) =>
  option?.key === 'gift' || /^free\b/i.test(String(option?.label ?? '').trim());

const offers = await db.collection('offers').where('reward.kind', '==', 'freeGift').get();
const offersByProduct = new Map();
for (const snap of offers.docs) {
  const data = snap.data();
  const ids = (data.conditions?.anyOf ?? []).flatMap((group) =>
    (group.allOf ?? []).filter((rule) => rule.field === 'productId').flatMap((rule) => rule.in ?? []),
  );
  const state = data.archived ? ' (archived)' : data.active ? '' : ' (paused)';
  for (const id of ids) offersByProduct.set(id, [...(offersByProduct.get(id) ?? []), `${snap.id}${state}`]);
}

const products = await db.collection('products').get();
let found = 0;
for (const snap of products.docs) {
  const data = snap.data();
  const gifts = (Array.isArray(data.options) ? data.options : []).filter(isGiftOption);
  if (gifts.length === 0) continue;
  found += 1;
  console.log(`\n${data.slug}  (${snap.id})  ${data.published ? 'published' : 'not published'}`);
  for (const option of gifts) {
    const labels = (option.values ?? []).map((value) => `${value.label} [${value.id}]`);
    console.log(`  ${option.label}: ${labels.join(' | ')}`);
  }
  console.log(`  Free gift offers on it: ${(offersByProduct.get(snap.id) ?? []).join(', ') || 'none'}`);
}

console.log(
  found === 0
    ? `\nNo product has old gift options (${products.size} checked).`
    : `\n${found} of ${products.size} products still have old gift options. Move them with move-bag-gifts-to-offer.mjs.`,
);
