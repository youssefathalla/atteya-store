/**
 * Compare live Firestore indexes with firebase/firestore.indexes.json.
 * Usage: node scripts/check-indexes.mjs dev|prod [--deploy]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const ALIASES = { dev: 'dev', prod: 'prod' };
const INDEXES_PATH = path.resolve(process.cwd(), 'firebase/firestore.indexes.json');

const projectArg = process.argv[2];
const deploy = process.argv.includes('--deploy');

if (!projectArg || !ALIASES[projectArg]) {
  console.error(`${RED}Usage:${RESET} node scripts/check-indexes.mjs dev|prod [--deploy]`);
  process.exit(1);
}

function run(cmd, args, inherit = false) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: true,
    stdio: inherit ? 'inherit' : 'pipe',
  });
}

function fail(message) {
  console.error(`${RED}✖ Index check failed:${RESET} ${message}`);
  process.exit(1);
}

let fileDoc;
try {
  fileDoc = JSON.parse(fs.readFileSync(INDEXES_PATH, 'utf8'));
} catch (err) {
  fail(`could not read firestore.indexes.json: ${err.message}`);
}

const liveResult = run('firebase', ['firestore:indexes', '-P', projectArg, '--json']);
if (liveResult.status !== 0) {
  console.error(liveResult.stderr || liveResult.stdout || 'firebase firestore:indexes failed');
  process.exit(1);
}

let livePayload;
try {
  const parsed = JSON.parse(liveResult.stdout);
  livePayload = parsed.result ?? parsed;
} catch {
  fail('firebase firestore:indexes did not return valid JSON');
}

const fileComposites = (fileDoc.indexes ?? []).map((idx) => ({
  key: compositeKey(idx),
  label: formatComposite(idx),
  raw: idx,
}));
const liveComposites = (livePayload.indexes ?? []).map((idx) => ({
  key: compositeKey(idx),
  label: formatComposite(idx),
  state: idx.state,
  raw: idx,
}));

const fileOverrideKeys = new Set((fileDoc.fieldOverrides ?? []).map(fieldOverrideKey));
const liveOverrideKeys = new Set((livePayload.fieldOverrides ?? []).map(fieldOverrideKey));

const fileKeys = new Set(fileComposites.map((e) => e.key));
const liveKeys = new Set(liveComposites.map((e) => e.key));

const toCreate = fileComposites.filter((e) => !liveKeys.has(e.key));
const liveOnly = liveComposites.filter((e) => !fileKeys.has(e.key));

const building = liveComposites.filter((e) => e.state && e.state !== 'READY');

console.log(`\nFirestore index report (${projectArg})\n`);

if (building.length) {
  console.log(`${YELLOW}Indexes not READY:${RESET}`);
  for (const e of building) {
    console.log(`  • ${e.label} — state: ${e.state}`);
  }
  console.log('');
}

const overrideOnlyLive = [...liveOverrideKeys].filter((k) => !fileOverrideKeys.has(k));
const overrideOnlyFile = [...fileOverrideKeys].filter((k) => !liveOverrideKeys.has(k));
if (overrideOnlyFile.length || overrideOnlyLive.length) {
  console.log(`${YELLOW}Field overrides differ (composite indexes above are the main check):${RESET}`);
  for (const k of overrideOnlyFile) console.log(`  ＋ in file only: ${k}`);
  for (const k of overrideOnlyLive) console.log(`  ⚠ live only: ${k}`);
  console.log('');
}

if (toCreate.length) {
  console.log(`${GREEN}＋ Will be CREATED on deploy (in file, not live):${RESET}`);
  for (const e of toCreate) console.log(`  ${e.label}`);
  console.log('');
}

if (liveOnly.length) {
  console.log(
    `${YELLOW}⚠ Live but NOT in file (deploy will offer to DELETE these — answer N unless agreed):${RESET}`,
  );
  for (const e of liveOnly) console.log(`  ${e.label}`);
  console.log('');
}

const inSyncCount = fileComposites.length - toCreate.length;
if (!toCreate.length && !liveOnly.length) {
  console.log(`${GREEN}✔ In sync:${RESET} ${inSyncCount} composite index(es) match live.\n`);
} else {
  console.log(`✔ In sync: ${inSyncCount} composite index(es) already match live.\n`);
}

let exitCode = 0;
if (liveOnly.length) exitCode = 2;

if (deploy) {
  if (liveOnly.length) {
    console.log(
      `${YELLOW}Reminder:${RESET} Firebase may ask to delete indexes not in the file. Answer N unless we agreed on that deletion.\n`,
    );
  }
  const deployResult = run('firebase', ['deploy', '--only', 'firestore:indexes', '-P', projectArg], true);
  if (deployResult.status !== 0) process.exit(1);
  process.exit(0);
}

process.exit(exitCode);

function compositeKey(idx) {
  const scope = idx.queryScope ?? 'COLLECTION';
  const fields = normalizeFields(idx.fields ?? []);
  return `${idx.collectionGroup}|${scope}|${fields.join(';')}`;
}

function normalizeFields(fields) {
  return fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => {
      if (f.order) return `${f.fieldPath}:${f.order}`;
      if (f.arrayConfig) return `${f.fieldPath}:array:${f.arrayConfig}`;
      if (f.vectorConfig) return `${f.fieldPath}:vector:${JSON.stringify(f.vectorConfig)}`;
      return `${f.fieldPath}:?`;
    });
}

function formatComposite(idx) {
  const parts = (idx.fields ?? [])
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => {
      if (f.order) return `${f.fieldPath} ${f.order}`;
      if (f.arrayConfig) return `${f.fieldPath} ${f.arrayConfig}`;
      if (f.vectorConfig) return `${f.fieldPath} vector`;
      return f.fieldPath;
    });
  return `${idx.collectionGroup} (${parts.join(', ')})`;
}

function fieldOverrideKey(fo) {
  const indexes = [...(fo.indexes ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const ttl = fo.ttl ?? '';
  return `${fo.collectionGroup}|${fo.fieldPath}|${JSON.stringify(indexes)}|${ttl}`;
}
