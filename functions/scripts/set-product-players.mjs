/**
 * One-off first fill for Shop by player (ATS-79): add the players to the list in
 * `settings/players`, then set `players` on today's products.
 *
 * Run from the functions directory with Application Default Credentials:
 *   node scripts/set-product-players.mjs --project atteya-store-dev                          (dry run)
 *   node scripts/set-product-players.mjs --project atteya-store-dev --apply                  (writes)
 *   node scripts/set-product-players.mjs --project attiya-store --apply --confirm-prod       (prod)
 *
 * The products come from `scripts/data/product-players.json` (`{ id, slug, name, players }`),
 * a list proposed from product names and summaries that Youssef approves (or corrects)
 * before `--apply`. `matchedOn` is only a review note. On dev the manager agent may run --apply after a dry run; prod needs Youssef's OK (AGENTS.md, Deploy safety).
 * - Players missing from `settings/players` are added with the names below; a player
 *   already in the list keeps the name staff gave it. Nothing is removed or renamed.
 * - A product that already has players is left alone, so re-running is safe and anything
 *   set by hand in the product form stays. Unknown product ids are reported, never created.
 * After applying, run "Rebuild search" in Catalogue tools so the Player filter and
 * search pick up the names.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/** Players in today's catalogue (ATS-79 decisions). Link names never change once saved. */
const PLAYERS = [
  { id: 'ale-galan', name: 'Ale Galán' },
  { id: 'agustin-tapia', name: 'Agustín Tapia' },
  { id: 'fede-chingotto', name: 'Fede Chingotto' },
  { id: 'arturo-coello', name: 'Arturo Coello' },
  { id: 'juan-lebron', name: 'Juan Lebrón' },
  { id: 'franco-stupaczuk', name: 'Franco Stupaczuk' },
  { id: 'leo-augsburger', name: 'Leo Augsburger' },
  { id: 'edu-alonso', name: 'Edu Alonso' },
];
const MAX_PRODUCT_PLAYERS = 10;

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

const rows = JSON.parse(readFileSync(new URL('./data/product-players.json', import.meta.url), 'utf8'));
const seedIds = new Set(PLAYERS.map((player) => player.id));
for (const row of rows) {
  if (typeof row.id !== 'string' || !Array.isArray(row.players) || row.players.length === 0) {
    throw new Error(`Bad row: ${JSON.stringify(row)}`);
  }
  if (row.players.length > MAX_PRODUCT_PLAYERS) {
    throw new Error(`${row.id}: more than ${MAX_PRODUCT_PLAYERS} players`);
  }
  const unknown = row.players.filter((id) => !seedIds.has(id));
  if (unknown.length > 0) throw new Error(`${row.id}: unknown player id(s) ${unknown.join(', ')}`);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

// 1. Player list: add the missing players, keep everything already there.
const listRef = db.doc('settings/players');
const listSnap = await listRef.get();
const current = Array.isArray(listSnap.get('players')) ? listSnap.get('players') : [];
const currentIds = new Set(current.map((entry) => entry?.id).filter((id) => typeof id === 'string'));
const added = PLAYERS.filter((player) => !currentIds.has(player.id));
for (const player of added) {
  console.log(`${apply ? 'ADD     ' : 'WOULD ADD'} player ${player.name} (${player.id})`);
}
if (added.length === 0) console.log('Player list already has every player.');
if (apply && added.length > 0) {
  await listRef.set(
    {
      players: [...current, ...added],
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'script:set-product-players',
    },
    { merge: true },
  );
}

// 2. Products: set players only where none are set yet.
let written = 0;
let skipped = 0;
let missing = 0;
for (const row of rows) {
  const ref = db.collection('products').doc(row.id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`MISSING  ${row.id}  (${row.name})`);
    missing += 1;
    continue;
  }
  const data = snap.data();
  const existing = Array.isArray(data.players) ? data.players : [];
  if (existing.length > 0) {
    console.log(`SKIP     ${data.name}  (already [${existing.join(', ')}])`);
    skipped += 1;
    continue;
  }
  console.log(`${apply ? 'WRITE   ' : 'WOULD   '} ${data.name}  -> [${row.players.join(', ')}]`);
  if (apply) {
    await ref.update({ players: row.players, updatedAt: FieldValue.serverTimestamp() });
  }
  written += 1;
}

console.log(
  `\n${apply ? 'Wrote' : 'Would write'} ${written}, skipped ${skipped}, missing ${missing}.` +
    (apply ? ' Now run Rebuild search in Catalogue tools.' : ' Dry run only; add --apply to write.'),
);
