/**
 * One-off, repeatable (ATS-186): link the colours of one product into one model. Products with the
 * same name are colours of the same product (the slug script gives them `-black`, `-white`, ...),
 * but 14 such groups were never given a shared `modelGroup`, so lists showed every colour as its own
 * card and the colour row under the photo showed only one picture.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/link-colour-models.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/link-colour-models.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/link-colour-models.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * Products are grouped by name (trimmed, accents folded, any case), published or not. For each group
 * of two or more:
 *   - if none has a model, the group gets one from its name (`adidas-padel-shorts`);
 *   - if exactly one model is used, the colours without one join it;
 *   - if two different models are used, or the new model name is already used by another product,
 *     the group is listed as CHECK and left alone.
 *
 * Some colours of one product have different names (`Babolat Padel Shorts` in black and grey, and
 * `Babolat Printed Padel Shorts` in green and orange, are one product in four colours). Those are
 * listed by hand in `scripts/data/colour-model-groups.json` (model -> document ids) and linked first:
 * every listed product gets that model, even when it already had another one. A listed id that does
 * not exist, an id listed under two models, or the model being used by a product outside the list is
 * a CHECK, and that group is left alone. Listed products are left out of the name groups.
 * Each changed product gets `modelGroup`, `searchTokens` (admin search reads the model too), the
 * `modelGroup` lock (so Check catalogue structure never changes it back), `updatedAt` and `updatedBy`.
 * Each write is checked against the document's last update time, so a product edited while the
 * script runs is skipped instead of overwritten; run it again to pick it up. Re-running is safe.
 *
 * The colour-siblings trigger fills `colorSiblings` and search sync updates each record by itself;
 * run Catalogue Tools -> Rebuild search after applying anyway. On dev the manager agent applies after
 * a dry run; prod only on Youssef's OK. Cloud build sessions never run it.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const UPDATED_BY = 'script:link-colour-models';
/** Same limit as `modelGroup` in `ProductSchema` and the product form (`MAX_SLUG`). */
const MAX_MODEL_GROUP = 80;

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

const { buildSearchTokens } = require(join(__dirname, '../lib/products/search-tokens.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const folded = (value) => trimmed(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameKey = (value) => folded(value).replace(/\s+/g, ' ');
const modelFromName = (value) =>
  folded(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Hand-picked groups: colours of one product that have different names (model -> document ids). */
const MANUAL_GROUPS = JSON.parse(readFileSync(join(__dirname, 'data/colour-model-groups.json'), 'utf8'));

const snaps = (await db.collection('products').get()).docs;
console.log(`${snaps.length} products read from ${projectId}.`);
const snapById = new Map(snaps.map((snap) => [snap.id, snap]));

const checks = [];
const manualIds = new Set();
const listedTwice = new Set();
for (const ids of Object.values(MANUAL_GROUPS)) {
  for (const id of ids) {
    if (manualIds.has(id)) listedTwice.add(id);
    manualIds.add(id);
  }
}

const groups = new Map();
const productsByModel = new Map();
for (const snap of snaps) {
  const data = snap.data();
  const key = nameKey(data.name);
  if (key && !manualIds.has(snap.id)) {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(snap);
  }
  const model = trimmed(data.modelGroup);
  if (model) {
    if (!productsByModel.has(model)) productsByModel.set(model, new Set());
    productsByModel.get(model).add(snap.id);
  }
}

let changed = 0;
let raced = 0;
let groupsLinked = 0;

const productLabel = (snap) => `${trimmed(snap.data().slug)}${snap.data().published ? '' : ' (hidden)'}`;

/** Gives every member `target`; members already in it are left as they are. */
async function linkMembers(heading, members, target) {
  const todo = members.filter((snap) => trimmed(snap.data().modelGroup) !== target);
  if (todo.length === 0) return;
  groupsLinked += 1;
  console.log(`\n${heading}`);
  for (const snap of members) {
    const data = snap.data();
    const current = trimmed(data.modelGroup);
    const label = `  ${productLabel(snap)}`;
    if (current === target) {
      console.log(`${label}: already in it`);
      continue;
    }
    const locks = (Array.isArray(data.lockedFields) ? data.lockedFields : []).filter(
      (f) => typeof f === 'string',
    );
    const patch = {
      modelGroup: target,
      searchTokens: [...buildSearchTokens(trimmed(data.name), target)],
      ...(locks.includes('modelGroup') ? {} : { lockedFields: [...locks, 'modelGroup'] }),
    };
    console.log(`${label}: ${current || 'none'} -> ${target}  ${apply ? 'WRITE' : 'WOULD WRITE'}`);
    if (apply) {
      try {
        await snap.ref.update(
          { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: UPDATED_BY },
          { lastUpdateTime: snap.updateTime },
        );
      } catch (error) {
        raced += 1;
        console.log(`    SKIP: changed while the script ran (${error.message}); run again`);
        continue;
      }
    }
    changed += 1;
  }
}

for (const [target, ids] of Object.entries(MANUAL_GROUPS)) {
  const missing = ids.filter((id) => !snapById.has(id));
  const twice = ids.filter((id) => listedTwice.has(id));
  if (missing.length > 0 || twice.length > 0) {
    if (missing.length > 0) checks.push(`CHECK  ${target}: no product with id ${missing.join(', ')}`);
    if (twice.length > 0) checks.push(`CHECK  ${target}: listed under two models: ${twice.join(', ')}`);
    continue;
  }
  if (target !== modelFromName(target) || target.length > MAX_MODEL_GROUP) {
    checks.push(`CHECK  ${target}: not a valid model name (a-z, 0-9 and -, at most ${MAX_MODEL_GROUP})`);
    continue;
  }
  const outsiders = [...(productsByModel.get(target) ?? [])].filter((id) => !ids.includes(id));
  if (outsiders.length > 0) {
    checks.push(
      `CHECK  ${target}: also used by ${outsiders.join(', ')}; add them to the list or pick another model`,
    );
    continue;
  }
  const members = ids.map((id) => snapById.get(id));
  const names = [...new Set(members.map((snap) => trimmed(snap.data().name)))].join(' + ');
  await linkMembers(`${names}  -> model "${target}" (listed by hand)`, members, target);
}

for (const members of groups.values()) {
  if (members.length < 2) continue;
  const name = trimmed(members[0].data().name);
  const models = [...new Set(members.map((snap) => trimmed(snap.data().modelGroup)).filter(Boolean))];
  const slugs = members.map(productLabel);

  if (models.length > 1) {
    checks.push(
      `CHECK  ${name}: its colours use different models (${models.join(', ')}): ${slugs.join(', ')}`,
    );
    continue;
  }
  const target = models[0] ?? modelFromName(name);
  if (!target) {
    checks.push(`CHECK  ${name}: no model name can be made from it`);
    continue;
  }
  // The product schema and the product form allow at most 80 characters for `modelGroup`.
  if (target.length > MAX_MODEL_GROUP) {
    checks.push(
      `CHECK  ${name}: the model name "${target}" is longer than ${MAX_MODEL_GROUP} characters; set one in the admin`,
    );
    continue;
  }
  const memberIds = new Set(members.map((snap) => snap.id));
  const outsiders = [...(productsByModel.get(target) ?? [])].filter((id) => !memberIds.has(id));
  if (outsiders.length > 0) {
    checks.push(`CHECK  ${name}: the model "${target}" is already used by ${outsiders.join(', ')}`);
    continue;
  }

  await linkMembers(
    `${name}  -> model "${target}"${models.length === 0 ? ' (new)' : ' (existing)'}`,
    members,
    target,
  );
}

if (checks.length > 0) {
  console.log('\nLeft alone:');
  for (const line of checks) console.log(line);
}

console.log(
  `\n${apply ? 'Changed' : 'Would change'} ${changed} products in ${groupsLinked} models` +
    `${apply ? `, changed meanwhile ${raced}` : ''}.` +
    (apply ? ' Now run Catalogue Tools -> Rebuild search.' : ' Dry run only; add --apply to write.'),
);
