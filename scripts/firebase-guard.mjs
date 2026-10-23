/**
 * Blocks Firebase deploy scripts unless checkout is clean, on main, and matches origin/main.
 * Also validates firebase/firestore.indexes.json.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const INDEXES_PATH = path.resolve(process.cwd(), 'firebase/firestore.indexes.json');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', shell: true });
  if (result.error) {
    fail(`Failed to run ${cmd}: ${result.error.message}`);
  }
  return result;
}

function fail(message) {
  console.error(`${RED}✖ Deploy blocked:${RESET} ${message}`);
  process.exit(1);
}

function trimOutput(result) {
  return (result.stdout ?? '').trim() || (result.stderr ?? '').trim();
}

const branch = trimOutput(run('git', ['rev-parse', '--abbrev-ref', 'HEAD']));
if (branch !== 'main') {
  fail(`current branch is "${branch}", not main. Run: git checkout main && git pull`);
}

const status = trimOutput(run('git', ['status', '--porcelain', '--untracked-files=no']));
if (status) {
  fail('working tree has uncommitted changes to tracked files. Commit or stash before deploying.');
}

const fetch = run('git', ['fetch', 'origin', 'main', '--quiet']);
if (fetch.status !== 0) {
  fail(
    `could not reach origin (git fetch failed). Deploy aborted — fix network or auth, then retry.\n${trimOutput(fetch)}`,
  );
}

const head = trimOutput(run('git', ['rev-parse', 'HEAD']));
const originMain = trimOutput(run('git', ['rev-parse', 'origin/main']));
if (head !== originMain) {
  const counts = trimOutput(run('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main']));
  const [ahead = '0', behind = '0'] = counts.split(/\s+/);
  fail(
    `local main is not up to date with origin/main (ahead ${ahead}, behind ${behind}). Run: git pull`,
  );
}

let indexesRaw;
try {
  indexesRaw = fs.readFileSync(INDEXES_PATH, 'utf8');
} catch {
  fail(`missing ${path.relative(process.cwd(), INDEXES_PATH)}`);
}

let indexesDoc;
try {
  indexesDoc = JSON.parse(indexesRaw);
} catch (err) {
  fail(`firebase/firestore.indexes.json is not valid JSON: ${err.message}`);
}

const indexes = indexesDoc.indexes ?? [];
const seen = new Set();
for (const idx of indexes) {
  const key = compositeKey(idx);
  if (seen.has(key)) {
    fail(`duplicate composite index in firestore.indexes.json: ${formatComposite(idx)}`);
  }
  seen.add(key);
}

const shortSha = head.slice(0, 7);
console.log(`${GREEN}✔ On up-to-date main (${shortSha}). Safe to deploy.${RESET}`);
process.exit(0);

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
  const scope = idx.queryScope ?? 'COLLECTION';
  const parts = normalizeFields(idx.fields ?? []).map((part) => {
    const [fieldPath, kind, value] = part.split(':');
    if (kind === 'array') return `${fieldPath} ${value}`;
    return `${fieldPath} ${kind}`;
  });
  return `${idx.collectionGroup} [${scope}] (${parts.join(', ')})`;
}
