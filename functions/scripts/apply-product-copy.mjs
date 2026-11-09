/**
 * One-off (ATS-69): write the approved product names, summaries, descriptions and
 * option labels from `scripts/data/product-copy.json`.
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/apply-product-copy.mjs --project atteya-store-dev                          (dry run)
 *   node scripts/apply-product-copy.mjs --project atteya-store-dev --apply                  (writes)
 *   node scripts/apply-product-copy.mjs --project attiya-store --apply --confirm-prod       (prod)
 *
 * Each row in the data file is one product that Youssef approved (or corrected) on
 * the review page: `{ id, slug, name, summary, description, options }`.
 * - `description` is plain text: a blank line starts a new paragraph, a line break
 *   stays a line break (bullets are lines starting with "• "). It is stored as
 *   `descriptionHtml` the same way the product form does (`descriptionToHtml`).
 * - An empty `summary` or `description` clears that field.
 * - `options` lists only the options whose labels change: `{ key, label, values }`,
 *   where `values` maps a value **id** to its new label. Option keys and value ids
 *   never change, so `stockBySize`, variants, carts and orders still match.
 *
 * Slugs, prices, stock, photos and categories are never touched. A row whose slug
 * no longer matches the product is skipped. Each write is checked against the
 * document's last update time, so a product edited while the script runs is
 * skipped instead of overwritten; run it again to pick it up. Re-running is safe:
 * products that already match are left alone.
 *
 * After applying: Catalogue Tools -> Rebuild search, then Check catalogue
 * structure (Preview -> Apply) so admin search matches the new names.
 * On dev the manager agent may run --apply after a dry run; prod needs Youssef's OK (AGENTS.md, Deploy safety).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DATA_FILE = new URL('./data/product-copy.json', import.meta.url);

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
if (apply && projectId === 'attiya-store' && arg('confirm-prod') !== true) {
  throw new Error('Writing to prod requires --confirm-prod.');
}

/** Same output as descriptionToHtml() in src/products/product-form.ts. */
function descriptionToHtml(text) {
  const normalised = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (normalised.length === 0) return null;
  const escapeHtml = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  const paragraphs = [];
  let current = [];
  for (const line of normalised.split('\n')) {
    if (line.trim().length === 0) {
      if (current.length > 0) {
        paragraphs.push(current);
        current = [];
      }
      continue;
    }
    current.push(line.trim());
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs.map((lines) => `<p>${lines.map(escapeHtml).join('<br>')}</p>`).join('');
}

const textOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

const rows = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
if (!Array.isArray(rows)) throw new Error('product-copy.json must be a list of rows');

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

let changed = 0;
let same = 0;
let skipped = 0;
let raced = 0;

for (const row of rows) {
  const ref = db.collection('products').doc(row.id);
  const snap = await ref.get();
  if (!snap.exists) {
    skipped += 1;
    console.log(`SKIP     ${row.slug} (${row.id}) no longer exists`);
    continue;
  }
  const data = snap.data();
  if (data.slug !== row.slug) {
    skipped += 1;
    console.log(`SKIP     ${row.slug} (${row.id}) slug is now "${data.slug}"`);
    continue;
  }

  const patch = {};
  const notes = [];

  const name = textOrNull(row.name);
  if (name && name !== data.name) {
    patch.name = name;
    notes.push(`name "${data.name}" -> "${name}"`);
  }
  const summary = textOrNull(row.summary);
  if (summary !== (data.summary ?? null)) {
    if (summary && summary.length > 300) throw new Error(`${row.slug}: summary is over 300 characters`);
    patch.summary = summary;
    notes.push(summary ? 'summary' : 'summary cleared');
  }
  const descriptionHtml = descriptionToHtml(typeof row.description === 'string' ? row.description : '');
  if (descriptionHtml !== (data.descriptionHtml ?? null)) {
    patch.descriptionHtml = descriptionHtml;
    notes.push(descriptionHtml ? 'description' : 'description cleared');
  }

  const options = Array.isArray(data.options) ? data.options : [];
  let optionsChanged = false;
  const nextOptions = options.map((option) => {
    const change = (row.options ?? []).find((item) => item.key === option?.key);
    if (!change) return option;
    const next = { ...option };
    if (textOrNull(change.label) && change.label !== option.label) {
      notes.push(`option ${option.key} "${option.label}" -> "${change.label}"`);
      next.label = change.label;
      optionsChanged = true;
    }
    const values = Array.isArray(option.values) ? option.values : [];
    next.values = values.map((value) => {
      const label = textOrNull(change.values?.[value?.id]);
      if (!label || label === value.label) return value;
      notes.push(`${option.key}.${value.id} "${value.label}" -> "${label}"`);
      optionsChanged = true;
      return { ...value, label };
    });
    return next;
  });
  if (optionsChanged) patch.options = nextOptions;

  if (notes.length === 0) {
    same += 1;
    continue;
  }
  console.log(`${apply ? 'WRITE   ' : 'WOULD   '} ${row.slug}  ${notes.join('; ')}`);
  if (apply) {
    try {
      await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: snap.updateTime });
    } catch (error) {
      raced += 1;
      console.log(`SKIP     ${row.slug} changed while the script ran (${error.message}); run again`);
      continue;
    }
  }
  changed += 1;
}

console.log(
  `\n${rows.length} rows. ${apply ? 'Updated' : 'Would update'} ${changed}, already right ${same}, ` +
    `skipped ${skipped}${apply ? `, changed meanwhile ${raced}` : ''}.` +
    (apply
      ? ' Now run Catalogue Tools -> Rebuild search, then Check catalogue structure (Preview -> Apply).'
      : ' Dry run only; add --apply to write.'),
);
