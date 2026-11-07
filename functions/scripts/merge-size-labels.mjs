/**
 * One-off: give each size one name, so the Shop size filter stops showing the
 * same size twice ("T2" and "T2 (M)", "T3" and "T3 (L–XL)"). The version with
 * brackets wins.
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/merge-size-labels.mjs --project atteya-store-dev           (dry run)
 *   node scripts/merge-size-labels.mjs --project atteya-store-dev --apply   (writes)
 *
 * The dry run lists every distinct size name in the catalogue with how many
 * products use it, so other duplicates can be spotted and added to RENAMES.
 *
 * Only the size **label** on each product's `size` option changes. The size id
 * stays the same, so `stockBySize`, `variants[].values` and carts keep pointing at
 * the right size. A product that already has both names as separate sizes is
 * reported and left alone (its two sizes have their own ids and stock). Each write
 * is checked against the document's last update time, so a product edited while
 * the script runs is skipped instead of overwritten; run it again to pick it up.
 * Re-running is safe: products already using the new name are left alone.
 *
 * Offers whose size conditions mention an old name (in `conditions`, `exclude`
 * or a buy-X-get-Y `reward.getConditions`) are listed (not changed): edit those
 * offers in the admin after applying.
 *
 * After applying, run "Rebuild search" in Catalogue Tools so Algolia picks up the
 * new size names. Agents never run --apply.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';

/** Old size name -> the name that wins. */
const RENAMES = {
  T2: 'T2 (M)',
  T3: 'T3 (L–XL)',
};

const PAGE_SIZE = 200;

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

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/** Distinct size label -> number of products using it. */
const labelCounts = new Map();
let scanned = 0;
let changed = 0;
let conflicts = 0;
let raced = 0;

let cursor = null;
for (;;) {
  let query = db.collection('products').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;

  for (const snap of page.docs) {
    scanned += 1;
    const data = snap.data();
    const options = Array.isArray(data.options) ? data.options : [];
    const sizeIndex = options.findIndex((option) => option?.key === 'size');
    if (sizeIndex === -1) continue;
    const values = Array.isArray(options[sizeIndex].values) ? options[sizeIndex].values : [];

    const labels = new Set(values.map((value) => trimmed(value?.label)).filter(Boolean));
    for (const label of labels) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);

    const renames = values.filter((value) => trimmed(value?.label) in RENAMES);
    if (renames.length === 0) continue;

    const clash = renames.find((value) => labels.has(RENAMES[trimmed(value.label)]));
    if (clash) {
      conflicts += 1;
      console.log(
        `CONFLICT ${data.name ?? snap.id}  (${snap.id}) has both "${trimmed(clash.label)}" and ` +
          `"${RENAMES[trimmed(clash.label)]}" as separate sizes; left alone, fix it in the product form`,
      );
      continue;
    }

    const nextValues = values.map((value) => {
      const label = trimmed(value?.label);
      return label in RENAMES ? { ...value, label: RENAMES[label] } : value;
    });
    const nextOptions = options.map((option, index) =>
      index === sizeIndex ? { ...option, values: nextValues } : option,
    );
    const summary = renames
      .map((value) => `"${trimmed(value.label)}" -> "${RENAMES[trimmed(value.label)]}" (id ${value.id})`)
      .join(', ');
    console.log(`${apply ? 'WRITE   ' : 'WOULD   '} ${data.name ?? snap.id}  (${snap.id})  ${summary}`);

    if (apply) {
      try {
        await snap.ref.update(
          { options: nextOptions, updatedAt: FieldValue.serverTimestamp() },
          { lastUpdateTime: snap.updateTime },
        );
      } catch (error) {
        raced += 1;
        console.log(`SKIP     ${snap.id} changed while the script ran (${error.message}); run again`);
        continue;
      }
    }
    changed += 1;
  }

  cursor = page.docs[page.docs.length - 1];
  if (page.size < PAGE_SIZE) break;
}

console.log('\nSize names in the catalogue (products using each, before this run):');
for (const [label, count] of [...labelCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const note = label in RENAMES ? `  -> becomes "${RENAMES[label]}"` : '';
  console.log(`  ${label.padEnd(16)} ${String(count).padStart(4)}${note}`);
}

const offers = await db.collection('offers').limit(500).get();
const oldNames = new Set(Object.keys(RENAMES));
const offersToEdit = [];
const asList = (value) => (Array.isArray(value) ? value : []);
/** True when a conditions object ({ anyOf: [{ allOf: [...] }] }) names an old size. */
const mentionsOldSize = (conditions) =>
  asList(conditions?.anyOf).some((group) =>
    asList(group?.allOf).some(
      (atom) =>
        atom?.field === 'sizes' &&
        [...asList(atom.in), ...asList(atom.notIn)].some((size) => oldNames.has(trimmed(size))),
    ),
  );
for (const snap of offers.docs) {
  const data = snap.data();
  // Sizes can appear in the main conditions, in the exclude list, and in the
  // "get" conditions of a buy-X-get-Y reward.
  const places = [
    ['conditions', data.conditions],
    ['exclude', data.exclude],
    ['reward.getConditions', data.reward?.getConditions],
  ]
    .filter(([, conditions]) => mentionsOldSize(conditions))
    .map(([where]) => where);
  if (places.length > 0) {
    offersToEdit.push(`${data.name ?? snap.id} (${snap.id})  in ${places.join(', ')}`);
  }
}
if (offersToEdit.length > 0) {
  console.log('\nOffers with a size condition using an old name (edit these in the admin):');
  for (const line of offersToEdit) console.log(`  ${line}`);
}

console.log(
  `\nScanned ${scanned} products. ${apply ? 'Renamed' : 'Would rename'} sizes on ${changed}, ` +
    `conflicts ${conflicts}${apply ? `, skipped (changed meanwhile) ${raced}` : ''}.` +
    (apply
      ? ' Now run Catalogue Tools -> Rebuild search.'
      : ' Dry run only; add --apply to write.'),
);
