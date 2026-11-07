/**
 * Git pre-push hook (`scripts/git-hooks/pre-push` runs this; `npm ci` / `npm install` point git at that
 * folder through the `prepare` script). It runs on every `git push`, by a person or any agent, before
 * anything reaches GitHub, so mistakes cost seconds here instead of a CI run or a Claude Fix round.
 *
 * For each branch being pushed (deletes are ignored):
 *   1. The branch name must follow `<type>/<short-name>` (`.agents/skills/branch-naming/SKILL.md`).
 *      `develop` and `main` are exempt. A bad name prints the exact rename commands.
 *   2. Every new non-merge commit must start with the Linear id (`<KEY>-123 …`, current key from
 *      `linear.config.json`). Skipped for `develop` and `main`.
 *   3. Checks, by what changed against the remote (or `origin/develop` for a new branch):
 *      always `npm run preflight` and `npm run test:cart`; `npm test --prefix functions` when
 *      `functions/` changed; `npx ng build --configuration development` when app code changed.
 *
 * Skip everything in an emergency: `git push --no-verify`. Skip only the checks (keep the name and
 * commit rules): `SKIP_PUSH_CHECKS=1 git push`.
 *
 * git passes `<local ref> <local sha> <remote ref> <remote sha>` lines on stdin.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { isValidBranchName } from './check-branch-name.mjs';
import { allTeamKeysOrEmpty } from '../lib/linear-config.mjs';

const ZERO = /^0+$/;
const EXEMPT = new Set(['develop', 'main']);
const KEY = allTeamKeysOrEmpty()[0] ?? '';
const COMMIT_ID = KEY ? new RegExp(`^(${KEY}-[0-9]+)([ ,]|$)`) : null;
/** App code: a change here needs the dev build. */
const APP_PATHS = [/^src\//, /^public\//, /^angular\.json$/, /^package(-lock)?\.json$/, /^tsconfig[^/]*\.json$/];
const FUNCTIONS_PATHS = [/^functions\//];
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tryGit(...args) {
  try {
    return git(...args);
  } catch {
    return '';
  }
}

function fail(lines) {
  process.stderr.write(`\n${RED}✖ Push blocked by the pre-push hook${RESET}\n${lines.join('\n')}\n\n`);
  process.stderr.write(`${DIM}Emergency only: git push --no-verify skips this hook.${RESET}\n\n`);
  process.exit(1);
}

/** Commits being pushed for one ref: new ones only. */
function newCommits(localSha, remoteSha) {
  const range = ZERO.test(remoteSha) ? [localSha, '--not', '--remotes=origin'] : [`${remoteSha}..${localSha}`];
  const out = tryGit('log', '--no-merges', '--format=%h%x09%s', ...range);
  return out ? out.split('\n').map((line) => {
    const [hash, ...subject] = line.split('\t');
    return { hash, subject: subject.join('\t') };
  }) : [];
}

/** Files changed by this push, compared with the remote branch or, for a new branch, origin/develop. */
function changedFiles(localSha, remoteSha) {
  const base = !ZERO.test(remoteSha) ? remoteSha : tryGit('merge-base', localSha, 'origin/develop');
  if (!base) return null; // Unknown: run everything.
  const out = tryGit('diff', '--name-only', `${base}...${localSha}`) || tryGit('diff', '--name-only', base, localSha);
  return out ? out.split('\n') : [];
}

function run(label, command, args) {
  const started = Date.now();
  process.stdout.write(`${DIM}→ ${label}${RESET}\n`);
  // npm/npx are .cmd files on Windows and need a shell. The arguments are fixed strings in this
  // file (never user input), so one command line is safe and avoids Node's args-with-shell warning.
  const result = process.platform === 'win32'
    ? spawnSync([command, ...args].join(' '), { stdio: 'inherit', shell: true })
    : spawnSync(command, args, { stdio: 'inherit' });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (result.status !== 0) {
    fail([`${label} failed (${seconds}s). Fix it, commit, and push again.`, `Run it yourself: ${[command, ...args].join(' ')}`]);
  }
  process.stdout.write(`${GREEN}✓ ${label}${RESET} ${DIM}(${seconds}s)${RESET}\n`);
}

function main() {
  const lines = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const pushes = lines
    .map((line) => line.split(/\s+/))
    .filter(([, localSha]) => localSha && !ZERO.test(localSha)) // deletes have an all-zero local sha
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({
      localRef,
      localSha,
      remoteSha,
      branch: (remoteRef ?? '').replace(/^refs\/heads\//, ''),
    }))
    .filter((p) => p.branch && !p.branch.startsWith('refs/')); // tags and other refs: nothing to check

  if (pushes.length === 0) return;

  // 1. Branch names.
  for (const p of pushes) {
    if (EXEMPT.has(p.branch) || isValidBranchName(p.branch)) continue;
    const local = p.localRef.replace(/^refs\/heads\//, '');
    fail([
      `Branch "${p.branch}" does not follow the branch rule: <type>/<short-name>.`,
      'Types: feature, fix, hotfix, refactor, perf, docs, test, chore, ci (not feat/ or bugfix/).',
      '<short-name>: 2-5 lowercase words (a-z, 0-9) joined by hyphens, 50 characters at most in total.',
      `No username, Linear id or date (the id goes in the PR title: ${KEY || 'KEY'}-123 ...).`,
      '',
      'Rename it, then push the new name:',
      `  git branch -m ${local} <type>/<short-name>`,
      '  git push -u origin <type>/<short-name>',
      `If "${p.branch}" was already pushed, delete the old one: git push origin --delete ${p.branch}`,
      'Full rule: .agents/skills/branch-naming/SKILL.md',
    ]);
  }

  // 2. Commit messages start with the Linear id.
  if (COMMIT_ID) {
    const bad = pushes
      .filter((p) => !EXEMPT.has(p.branch))
      .flatMap((p) => newCommits(p.localSha, p.remoteSha))
      .filter((c) => !COMMIT_ID.test(c.subject));
    if (bad.length) {
      fail([
        `Commit messages must start with the Linear issue id: "${KEY}-123 Short summary".`,
        ...bad.slice(0, 10).map((c) => `  ${c.hash}  ${c.subject}`),
        ...(bad.length > 10 ? [`  … and ${bad.length - 10} more`] : []),
        '',
        `Only the last commit: git commit --amend -m "${KEY}-123 Short summary"`,
        `Several: git reset --soft <commit before them>, then one commit: git commit -m "${KEY}-123 Short summary"`,
      ]);
    }
  }

  // 3. Checks.
  if (process.env.SKIP_PUSH_CHECKS === '1') {
    process.stdout.write(`${DIM}SKIP_PUSH_CHECKS=1: names and commits checked, build and tests skipped.${RESET}\n`);
    return;
  }
  if (!existsSync('node_modules')) {
    fail(['node_modules is missing. Run npm ci (and npm ci --prefix functions), then push again.']);
  }

  let files = [];
  let unknown = false;
  for (const p of pushes) {
    const changed = changedFiles(p.localSha, p.remoteSha);
    if (changed === null) unknown = true;
    else files.push(...changed);
  }
  files = [...new Set(files)];
  const touches = (patterns) => unknown || files.some((f) => patterns.some((re) => re.test(f)));

  const checksStarted = Date.now();
  process.stdout.write(`${DIM}Pre-push checks (${unknown ? 'all' : `${files.length} changed file(s)`}). git push --no-verify skips them.${RESET}\n`);
  run('Preflight (engine sync, docs sync, design/a11y scan, eslint)', 'npm', ['run', 'preflight']);
  run('Cart pricing tests', 'npm', ['run', 'test:cart']);
  if (touches(FUNCTIONS_PATHS)) {
    if (!existsSync('functions/node_modules')) fail(['functions/node_modules is missing. Run npm ci --prefix functions, then push again.']);
    run('Functions build and tests', 'npm', ['test', '--prefix', 'functions']);
  }
  if (touches(APP_PATHS)) {
    run('App build (development)', 'npx', ['ng', 'build', '--configuration', 'development']);
  }
  const totalSeconds = Math.round((Date.now() - checksStarted) / 1000);
  process.stdout.write(`${GREEN}✓ Pre-push checks passed in ${totalSeconds}s.${RESET}\n`);
}

main();
