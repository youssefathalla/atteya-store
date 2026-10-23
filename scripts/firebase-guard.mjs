/**
 * Blocks Firebase deploy scripts unless checkout is clean, on main, and matches origin/main.
 * Also validates firebase/firestore.indexes.json.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositeKey, formatComposite } from './lib/firestore-indexes.mjs';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const INDEXES_PATH = path.resolve(process.cwd(), 'firebase/firestore.indexes.json');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', shell: true });
  if (result.error) {
    return { error: `Failed to run ${cmd}: ${result.error.message}` };
  }
  return { result };
}

function trimOutput({ result }) {
  return (result.stdout ?? '').trim() || (result.stderr ?? '').trim();
}

/**
 * @returns {{ ok: true, sha: string } | { ok: false }}
 */
export function runGuard() {
  const branchOut = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchOut.error) {
    console.error(`${RED}✖ Deploy blocked:${RESET} ${branchOut.error}`);
    return { ok: false };
  }
  const branch = trimOutput(branchOut);
  if (branch !== 'main') {
    console.error(
      `${RED}✖ Deploy blocked:${RESET} current branch is "${branch}", not main. Run: git checkout main && git pull`,
    );
    return { ok: false };
  }

  const statusOut = run('git', ['status', '--porcelain', '--untracked-files=no']);
  if (statusOut.error) {
    console.error(`${RED}✖ Deploy blocked:${RESET} ${statusOut.error}`);
    return { ok: false };
  }
  if (trimOutput(statusOut)) {
    console.error(
      `${RED}✖ Deploy blocked:${RESET} working tree has uncommitted changes to tracked files. Commit or stash before deploying.`,
    );
    return { ok: false };
  }

  const fetchOut = run('git', ['fetch', 'origin', 'main', '--quiet']);
  if (fetchOut.error) {
    console.error(`${RED}✖ Deploy blocked:${RESET} ${fetchOut.error}`);
    return { ok: false };
  }
  if (fetchOut.result.status !== 0) {
    console.error(
      `${RED}✖ Deploy blocked:${RESET} could not reach origin (git fetch failed). Deploy aborted — fix network or auth, then retry.\n${trimOutput(fetchOut)}`,
    );
    return { ok: false };
  }

  const headOut = run('git', ['rev-parse', 'HEAD']);
  const originOut = run('git', ['rev-parse', 'origin/main']);
  if (headOut.error || originOut.error) {
    console.error(`${RED}✖ Deploy blocked:${RESET} could not read git refs.`);
    return { ok: false };
  }
  const head = trimOutput(headOut);
  const originMain = trimOutput(originOut);
  if (head !== originMain) {
    const countsOut = run('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
    const [ahead = '0', behind = '0'] = trimOutput(countsOut).split(/\s+/);
    console.error(
      `${RED}✖ Deploy blocked:${RESET} local main is not up to date with origin/main (ahead ${ahead}, behind ${behind}). Run: git pull`,
    );
    return { ok: false };
  }

  let indexesRaw;
  try {
    indexesRaw = fs.readFileSync(INDEXES_PATH, 'utf8');
  } catch {
    console.error(
      `${RED}✖ Deploy blocked:${RESET} missing ${path.relative(process.cwd(), INDEXES_PATH)}`,
    );
    return { ok: false };
  }

  let indexesDoc;
  try {
    indexesDoc = JSON.parse(indexesRaw);
  } catch (err) {
    console.error(
      `${RED}✖ Deploy blocked:${RESET} firebase/firestore.indexes.json is not valid JSON: ${err.message}`,
    );
    return { ok: false };
  }

  const indexes = indexesDoc.indexes ?? [];
  const seen = new Set();
  for (const idx of indexes) {
    const key = compositeKey(idx);
    if (seen.has(key)) {
      console.error(
        `${RED}✖ Deploy blocked:${RESET} duplicate composite index in firestore.indexes.json: ${formatComposite(idx)}`,
      );
      return { ok: false };
    }
    seen.add(key);
  }

  const shortSha = head.slice(0, 7);
  console.log(`${GREEN}✔ On up-to-date main (${shortSha}). Safe to deploy.${RESET}`);
  return { ok: true, sha: shortSha };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const guard = runGuard();
  process.exit(guard.ok ? 0 : 1);
}
