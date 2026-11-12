/**
 * Blocks Firebase deploy scripts unless checkout is clean, on the deploy branch for that
 * project, and matches its origin. Also validates firebase/firestore.indexes.json.
 *
 * Dev deploys run from an up-to-date `develop` (the dev site), prod deploys from an up-to-date
 * `main` (the live store). Kept this way at launch so a change is always tested on dev before it
 * is released (see "Release flow" in AGENTS.md).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { compositeKey, formatComposite } from './lib/firestore-indexes.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const INDEXES_PATH = path.resolve(process.cwd(), 'firebase/firestore.indexes.json');

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', shell: false });
  if (result.error) {
    return { error: `Failed to run git: ${result.error.message}` };
  }
  return { result };
}

function trimOutput({ result }) {
  return (result.stdout ?? '').trim() || (result.stderr ?? '').trim();
}

/** Branch each Firebase project deploys from. */
export const DEPLOY_BRANCH = { dev: 'develop', prod: 'main' };

/**
 * @param {'dev' | 'prod'} alias Firebase project alias being deployed.
 * @returns {{ ok: true, sha: string } | { ok: false }}
 */
export function runGuard(alias) {
  const expected = DEPLOY_BRANCH[alias];
  if (!expected) {
    console.error(`${RED}✖ Deploy blocked:${RESET} unknown project alias "${alias}". Use dev or prod.`);
    return { ok: false };
  }
  const branchOut = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchOut.error) {
    console.error(`${RED}✖ Deploy blocked:${RESET} ${branchOut.error}`);
    return { ok: false };
  }
  const branch = trimOutput(branchOut);
  if (branch !== expected) {
    console.error(
      `${RED}✖ Deploy blocked:${RESET} ${alias} deploys run from ${expected}, but the current branch is "${branch}". Run: git checkout ${expected} && git pull`,
    );
    return { ok: false };
  }

  const statusOut = runGit(['status', '--porcelain', '--untracked-files=no']);
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

  const fetchOut = runGit(['fetch', 'origin', expected, '--quiet']);
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

  const headOut = runGit(['rev-parse', 'HEAD']);
  const originOut = runGit(['rev-parse', `origin/${expected}`]);
  if (headOut.error || originOut.error) {
    console.error(`${RED}✖ Deploy blocked:${RESET} could not read git refs.`);
    return { ok: false };
  }
  const head = trimOutput(headOut);
  const originMain = trimOutput(originOut);
  if (head !== originMain) {
    const countsOut = runGit(['rev-list', '--left-right', '--count', `HEAD...origin/${expected}`]);
    const [ahead = '0', behind = '0'] = trimOutput(countsOut).split(/\s+/);
    console.error(
      `${RED}✖ Deploy blocked:${RESET} local ${expected} is not up to date with origin/${expected} (ahead ${ahead}, behind ${behind}). Run: git pull`,
    );
    return { ok: false };
  }

  let indexesRaw;
  try {
    indexesRaw = fs.readFileSync(INDEXES_PATH, 'utf8');
  } catch {
    console.error(`${RED}✖ Deploy blocked:${RESET} missing ${path.relative(process.cwd(), INDEXES_PATH)}`);
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
  console.log(`${GREEN}✔ On up-to-date ${expected} (${shortSha}). Safe to deploy to ${alias}.${RESET}`);
  return { ok: true, sha: shortSha };
}

if (isMainModule(import.meta.url)) {
  // `npm run fb:guard -- dev|prod` (prod when omitted).
  const guard = runGuard(process.argv[2] === 'dev' ? 'dev' : 'prod');
  process.exit(guard.ok ? 0 : 1);
}
