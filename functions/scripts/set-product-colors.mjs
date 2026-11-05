/**
 * One-off: fill in `colors` for products that have none, and lock the field
 * as a record that these were set by hand.
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/set-product-colors.mjs --project atteya-store-dev           (dry run)
 *   node scripts/set-product-colors.mjs --project atteya-store-dev --apply   (writes)
 *
 * Only touches products whose `colors` is currently empty, so re-running is safe
 * and anything edited by hand since is left alone. After applying, run
 * "Rebuild search" in Catalogue tools so Algolia picks up the new colours.
 * Product ids (`eo-<uuid>`) come from the one-time catalogue copy and are the same
 * on dev and prod. Unknown ids are reported, never created.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const COLORS = {
  'eo-9d7c2158-5b63-4e5c-83a2-c6a0affdf29b': ['white', 'green'], // Nox t-shirt polo only
  'eo-a1fc907e-08b6-4fec-a98e-6d76ed7e7064': ['red', 'yellow'], // Wilson Padel Balls X3
  'eo-cdf4c203-9a0d-4fba-9288-8e74ba8713d2': ['black', 'red'], // Adidas Speed RX Padel Balls
  'eo-0d48d712-64cd-4646-82e3-f87e55e03762': ['purple', 'black'], // Bullpadel Neuron 02 Edge 2027
  'eo-c0d7e6b0-7adc-4df3-9214-dc539790cb10': ['black'], // Adidas Arrow Hit 2026
  'eo-8067630d-f9f2-444f-9ca2-3024a7fbeca7': ['white', 'black'], // Adidas Metalbone Carbon Ctrl 2026
  'eo-8ee68962-fd78-4db9-a279-3ea10ceb30ee': ['black', 'grey'], // Adidas Cross It Ctrl 3.4
  'eo-ade54272-babc-4cad-b62a-f6cd9a5d88a7': ['black', 'grey'], // Bullpadel XPLO 2026
  'eo-a1fc7e57-29c5-4198-9891-c19ba8f8159d': ['black', 'red'], // Siux Electra Stupa bag
  'eo-8481b4a5-3682-42e4-adfc-723cc4cb3103': ['blue'], // Nox EA10 Ventus Attack
  'eo-ea99fa63-1111-4dcd-acc2-7d93ccafb617': ['white', 'black'], // Bullpadel Vertex 05 2026
  'eo-8b4ad4f0-7524-4e84-ad4f-1711e2ac5676': ['black'], // Adidas Metalbone HRD+ 2026
  'eo-603010ed-79b3-4791-bd88-5dabd2413620': ['black', 'grey'], // Adidas Metalbone 2026
  'eo-652c3516-cd1f-4616-b3d4-595d1e3c74a2': ['multi'], // Adidas Rx Series Light 2026
  'eo-6fdac040-d8e5-4e6e-99b3-ae688efba74b': ['green', 'black'], // Adidas Rx Series 2026 Men
  'eo-280d086e-0782-46fb-af8b-6a250d3736e5': ['green', 'black'], // Bullpadel XPLO 2027 (mint green)
  'eo-75ca3f5b-6bd2-401b-93f5-8da45d49c1b6': ['white', 'black'], // Bullpadel Vertex 05 Hybrid 2027
  'eo-71f57cae-0fa9-47ba-97fe-d935bfc92ef9': ['black', 'orange'], // Bullpadel Vertex 05 Comfort 2027
  'eo-e16934b2-aa02-40d3-ab30-921c52846bd8': ['black'], // Nox Pro Titanium Balls
  'eo-ab7103b6-7bf2-4fe0-913a-53abb89aebf5': ['white'], // Head Racket Protector
  'eo-e8baf073-8f38-48f5-b5ff-b37473e70e7c': ['white', 'green'], // Nox Set Polo Tapia 2026
  'eo-469fb614-b46e-4865-987e-0e51e25fc8de': ['black'], // Short Head
  'eo-df639bd5-555e-4a6f-94bd-43df14ab1af3': ['beige'], // Bullpadel t-shirt Chingotto (tan)
  'eo-3b753dfb-da9f-4c29-84ae-1121e76dff13': ['white'], // Lebron t-shirt 2026
  'eo-bb587ce0-9b89-4529-90a7-4656827b1c48': ['purple'], // Augsburger t-shirt Siux 2026
  'eo-016826d2-9748-4870-ac1c-cefbc03dff0c': ['orange'], // Babolat t-shirt Lebron 2026
  'eo-97d60b70-3cb4-44bf-b26f-c90177f7bb97': ['orange'], // Augsburger T-shirt Siux 2026
  'eo-d55082b5-e14d-4fbc-b795-0ea2f31258ec': ['navy', 'pink'], // Head T-shirt
  'eo-ef259bfa-1bdd-4db9-acfb-067bc4a221d2': ['grey', 'navy'], // Stupa T-shirt Siux
  'eo-14f5ae0f-fa87-4d4a-8046-23c6740c0b92': ['black'], // Thermal Water Bottle Atteya
  'eo-5993673d-6ad6-4923-a3fb-c1b018d1665d': ['black'], // Thermal Water Bottle Bullpadel
  'eo-f3b0743a-5dbe-4714-a2b4-cc7a45bce083': ['black'], // Thermal Water Bottle Babolat
  'eo-7bbc7ec8-8e13-487c-b3d3-cc91279ba7ad': ['black'], // Thermal Water Bottle Nox
  'eo-cb17e985-f87c-4b26-b036-1b1a3cc1d167': ['black'], // Shorts Asics
  'eo-ef8a05c4-a1b9-4c73-96cd-645f8960a082': ['black'], // Short Bullpadel
  'eo-fc62ec11-6cac-4516-9bf3-53ec9d989236': ['white'], // Adidas Shirt Ale Galan 2025
  'eo-d1888ec1-a5a7-4fd5-b2e2-044ac6153df0': ['white'], // On Cloud T-shirt White
};

const PALETTE = new Set([
  'white', 'black', 'grey', 'beige', 'brown', 'navy', 'blue', 'light-blue', 'red',
  'orange', 'yellow', 'pink', 'green', 'purple', 'gold', 'silver', 'multi',
]);

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  if (next === undefined || next.startsWith('--')) return true;
  return next;
};

const projectId = arg('project');
if (!['atteya-store-dev', 'attiya-store'].includes(projectId)) {
  throw new Error('--project must be atteya-store-dev or attiya-store');
}
const apply = arg('apply') === true;

for (const [id, colors] of Object.entries(COLORS)) {
  const bad = colors.filter((c) => !PALETTE.has(c));
  if (bad.length > 0) throw new Error(`${id}: unknown colour id(s) ${bad.join(', ')}`);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

let written = 0;
let skipped = 0;
let missing = 0;
for (const [id, colors] of Object.entries(COLORS)) {
  const ref = db.collection('products').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`MISSING  ${id}`);
    missing += 1;
    continue;
  }
  const data = snap.data();
  const current = Array.isArray(data.colors) ? data.colors : [];
  if (current.length > 0) {
    console.log(`SKIP     ${data.name}  (already [${current.join(', ')}])`);
    skipped += 1;
    continue;
  }
  console.log(`${apply ? 'WRITE   ' : 'WOULD   '} ${data.name}  -> [${colors.join(', ')}]`);
  if (apply) {
    await ref.update({
      colors,
      lockedFields: FieldValue.arrayUnion('colors'),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  written += 1;
}

console.log(
  `\n${apply ? 'Wrote' : 'Would write'} ${written}, skipped ${skipped}, missing ${missing}.` +
    (apply ? '' : ' Dry run only; add --apply to write.'),
);
