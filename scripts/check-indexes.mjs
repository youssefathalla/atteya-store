/**
 * Compare live Firestore indexes with firebase/firestore.indexes.json.
 * Usage: node scripts/check-indexes.mjs dev|prod
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { compositeKey, formatComposite } from './lib/firestore-indexes.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const ALIASES = { dev: 'dev', prod: 'prod' };
const INDEXES_PATH = path.resolve(process.cwd(), 'firebase/firestore.indexes.json');

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: true, stdio: 'pipe' });
}

function fieldOverrideKey(fo) {
  const indexes = [...(fo.indexes ?? [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const ttl = fo.ttl ?? '';
  return `${fo.collectionGroup}|${fo.fieldPath}|${JSON.stringify(indexes)}|${ttl}`;
}

/**
 * @param {'dev'|'prod'} alias
 * @returns {{ ok: boolean, toCreate: object[], liveOnly: object[], building: object[] }}
 */
export function checkIndexes(alias) {
  const empty = { ok: false, toCreate: [], liveOnly: [], building: [] };

  let fileDoc;
  try {
    fileDoc = JSON.parse(fs.readFileSync(INDEXES_PATH, 'utf8'));
  } catch (err) {
    console.error(`${RED}✖ Index check failed:${RESET} could not read firestore.indexes.json: ${err.message}`);
    return empty;
  }

  const liveResult = run('firebase', ['firestore:indexes', '-P', alias, '--json']);
  if (liveResult.status !== 0) {
    console.error(liveResult.stderr || liveResult.stdout || 'firebase firestore:indexes failed');
    return empty;
  }

  let livePayload;
  try {
    const parsed = JSON.parse(liveResult.stdout);
    livePayload = parsed.result ?? parsed;
  } catch {
    console.error(`${RED}✖ Index check failed:${RESET} firebase firestore:indexes did not return valid JSON`);
    return empty;
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

  console.log(`\nFirestore index report (${alias})\n`);

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

  if (liveOnly.length) {
    console.log(
      `${YELLOW}Reminder:${RESET} Firebase may ask to delete indexes not in the file. Answer N unless we agreed on that deletion.\n`,
    );
  }

  return { ok: true, toCreate, liveOnly, building };
}

if (isMainModule(import.meta.url)) {
  const projectArg = process.argv[2];
  if (!projectArg || !ALIASES[projectArg]) {
    console.error(`${RED}Usage:${RESET} node scripts/check-indexes.mjs dev|prod`);
    process.exit(1);
  }
  const report = checkIndexes(projectArg);
  if (!report.ok) process.exit(1);
  process.exit(report.liveOnly.length ? 2 : 0);
}
