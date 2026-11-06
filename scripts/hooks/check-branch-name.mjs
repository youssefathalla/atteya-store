/**
 * Agent hook: blocks creating or renaming a git branch whose name breaks the house rule
 * (see `.agents/skills/branch-naming/SKILL.md`): `<type>/<short-name>`, where type is one of
 * feature, fix, hotfix, refactor, perf, docs, test, chore, ci (`feat/` and `bugfix/` are not allowed)
 * and `<short-name>` is 2-5 lowercase words (a-z, 0-9) joined by single hyphens, 50 characters at most in total,
 * with no Linear id (`you-123`; the id goes in the PR title).
 * `main` and `develop` are exempt.
 *
 * It also blocks a worktree outside the project: `git worktree add <path>` and `git worktree move <wt> <path>`
 * must target `<main project folder>/.claude/worktrees/<name>` (one folder, directly inside). The main project
 * folder comes from `git rev-parse --git-common-dir`, so a worktree started from inside another worktree is
 * placed next to it, not nested. Relative paths resolve from the hook's `cwd` (and `git -C <dir>`).
 *
 * Claude Code (PreToolUse on Bash and PowerShell, wired in `.claude/settings.json`):
 *   reads `{ cwd, tool_input: { command } }` on stdin. A broken rule exits 2 with the rule on stderr,
 *   which Claude Code feeds back to the agent. Everything else exits 0 with no output.
 *
 * Cursor (`beforeShellExecution`, wired in `.cursor/hooks.json` with `--cursor`):
 *   reads `{ command, cwd }` on stdin and always prints `{ "permission": "allow" | "deny", ... }` on stdout.
 *
 * Detected: `git checkout -b|-B|--orphan <name>`, `git switch -c|-C|--create|--force-create|--orphan <name>`,
 * `git branch <name> [start]`, `git branch -m|-M|-c|-C [old] <new>`, `git worktree add ... -b|-B <name>`.
 * Listing and deleting (`git branch`, `-a`, `--list`, `-d`, `-D`, `git worktree list|remove|prune`) are never blocked.
 *
 * Test: echo '{"tool_input":{"command":"git switch -c my-branch"}}' | node scripts/hooks/check-branch-name.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CURSOR = process.argv.includes('--cursor');
const MAX_LENGTH = 50;
const EXEMPT = new Set(['main', 'develop']);
const TYPES = ['feature', 'fix', 'hotfix', 'refactor', 'perf', 'docs', 'test', 'chore', 'ci'];
const PREFIXES = TYPES.map((type) => `${type}/`);
const MIN_WORDS = 2;
const MAX_WORDS = 5;
const WORD = /^[a-z0-9]+$/;
const DIGITS = /^[0-9]+$/;
const LINEAR_ID_WORD = /^you[0-9]+$/;

/** True when the short-name words carry a Linear id (`you-123` or `you123`), which belongs in the PR title. */
function hasLinearId(words) {
  return words.some((word, i) => LINEAR_ID_WORD.test(word) || (word === 'you' && DIGITS.test(words[i + 1] ?? '')));
}

/** True when `name` follows `<type>/<short-name>`: an allowed type, then 2-5 lowercase words, no Linear id. */
export function isValidBranchName(name) {
  if (EXEMPT.has(name)) return true;
  if (name.length > MAX_LENGTH) return false;
  const prefix = PREFIXES.find((p) => name.startsWith(p));
  if (!prefix) return false;
  const words = name.slice(prefix.length).split('-');
  if (words.length < MIN_WORDS || words.length > MAX_WORDS) return false;
  if (!words.every((word) => WORD.test(word))) return false;
  return !hasLinearId(words);
}

/**
 * Splits a shell command (bash or PowerShell) into simple commands, each a list of words.
 * Quotes are honoured and removed; `;`, `&`, `|`, newlines, brackets and redirections end a command.
 * Deliberately simple: it only has to find literal `git ...` calls.
 */
export function splitCommands(command) {
  const commands = [];
  let words = [];
  let word = '';
  let hasWord = false;
  let quote = '';

  const endWord = () => {
    if (hasWord) words.push(word);
    word = '';
    hasWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };

  for (const char of command) {
    if (quote) {
      if (char === quote) quote = '';
      else word += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasWord = true;
    } else if (char === ' ' || char === '\t' || char === '\r') {
      endWord();
    } else if (char === '>' || char === '<') {
      // `2>&1`: the digits belong to the redirection, not to git's arguments.
      if (/^\d*$/.test(word)) {
        word = '';
        hasWord = false;
      }
      endCommand();
    } else if (';&|\n(){}`'.includes(char)) {
      endCommand();
    } else {
      word += char;
      hasWord = true;
    }
  }
  endCommand();
  return commands;
}

/** git's own options that take a separate value (`git -C <path> ...`). */
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/** `git branch` flags that list, delete or edit branches instead of creating one. */
const BRANCH_READ_ONLY_FLAGS = new Set([
  '-d', '-D', '--delete', '-l', '--list', '-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose',
  '--show-current', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format',
  '--sort', '-u', '--set-upstream-to', '--unset-upstream', '--edit-description', '--column', '--no-column',
]);
const BRANCH_RENAME_FLAGS = new Set(['-m', '-M', '--move', '-c', '-C', '--copy']);

/**
 * A git call: the words after `git` (skipping git's own options) starting at the subcommand,
 * and the folder from `git -C <dir>` (null when absent). Null when the command is not git.
 */
function parseGit(words) {
  let i = 0;
  // Skip env assignments (`FOO=1 git ...`) and PowerShell's call operator.
  while (i < words.length && (words[i].includes('=') || words[i] === '&')) i++;
  const program = (words[i] ?? '').toLowerCase().replaceAll('\\', '/');
  if (program !== 'git' && program !== 'git.exe' && !program.endsWith('/git') && !program.endsWith('/git.exe')) {
    return null;
  }
  i++;
  let chdir = null;
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C') chdir = words[i + 1] ?? null;
    i += GIT_VALUE_OPTIONS.has(words[i]) ? 2 : 1;
  }
  return { args: words.slice(i), chdir };
}

/** The words after `git` (skipping git's own options), starting at the subcommand, or null. */
function gitArgs(words) {
  return parseGit(words)?.args ?? null;
}

/** The value after the first of `flags` in `args` (`-b name` or `--create=name`), or null. */
function flagValue(args, flags) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (flags.includes(arg)) return args[i + 1] ?? null;
    const long = flags.find((f) => f.startsWith('--') && arg.startsWith(`${f}=`));
    if (long) return arg.slice(long.length + 1);
  }
  return null;
}

/** Arguments of `git branch` that are not flags. */
function positionals(args) {
  return args.filter((arg) => !arg.startsWith('-'));
}

/** New branch names that one simple command would create or rename to. */
export function newBranchNames(words) {
  const args = gitArgs(words);
  if (!args?.length) return [];
  const [sub, ...rest] = args;

  if (sub === 'checkout') return [flagValue(rest, ['-b', '-B', '--orphan'])].filter(Boolean);
  if (sub === 'switch') return [flagValue(rest, ['-c', '-C', '--create', '--force-create', '--orphan'])].filter(Boolean);
  if (sub === 'worktree' && rest[0] === 'add') return [flagValue(rest.slice(1), ['-b', '-B'])].filter(Boolean);

  if (sub === 'branch') {
    const flags = rest.filter((arg) => arg.startsWith('-')).map((arg) => arg.split('=')[0]);
    if (flags.some((flag) => BRANCH_READ_ONLY_FLAGS.has(flag))) return [];
    const names = positionals(rest);
    if (flags.some((flag) => BRANCH_RENAME_FLAGS.has(flag))) return names.length ? [names.at(-1)] : [];
    return names.length ? [names[0]] : [];
  }
  return [];
}

/** Names in `command` that break the rule. Names built from variables cannot be checked and pass. */
export function badBranchNames(command) {
  return splitCommands(command)
    .flatMap(newBranchNames)
    .filter((name) => !name.includes('$') && !name.includes('%'))
    .filter((name) => !isValidBranchName(name));
}

/** Options of `git worktree add` that take a separate value. */
const WORKTREE_ADD_VALUE_OPTIONS = new Set(['-b', '-B', '--reason']);

/** Worktree folders one simple command would create (`worktree add`) or move to (`worktree move`). */
export function newWorktreePaths(words) {
  const git = parseGit(words);
  if (!git || git.args[0] !== 'worktree') return [];
  const [, action, ...rest] = git.args;
  let target = null;
  if (action === 'add') {
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--') {
        target = rest[i + 1] ?? null;
        break;
      }
      if (WORKTREE_ADD_VALUE_OPTIONS.has(arg)) i++;
      else if (!arg.startsWith('-')) {
        target = arg;
        break;
      }
    }
  } else if (action === 'move') {
    target = positionals(rest)[1] ?? null;
  }
  return target ? [{ target, chdir: git.chdir }] : [];
}

/** The main project folder (parent of the shared `.git`) for a folder inside the repo, or null outside git. */
function mainProjectFolder(dir) {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    return common ? path.dirname(path.resolve(common)) : null;
  } catch {
    return null;
  }
}

function resolvePath(base, target) {
  const home = target === '~' || target.startsWith('~/') || target.startsWith('~\\');
  return path.resolve(base, home ? path.join(homedir(), target.slice(1)) : target);
}

/** True when `target` is one folder directly inside `<root>/.claude/worktrees/`. */
export function isProjectWorktreePath(target, root) {
  const relative = path.relative(path.join(root, '.claude', 'worktrees'), target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) && !/[\\/]/.test(relative);
}

/**
 * Worktree paths in `command` that are outside `<main project folder>/.claude/worktrees/`, with that folder.
 * Paths built from variables, and commands outside a git repo, cannot be checked and pass.
 */
export function badWorktreePaths(command, cwd) {
  const bad = [];
  for (const { target, chdir } of splitCommands(command).flatMap(newWorktreePaths)) {
    if (target.includes('$') || target.includes('%')) continue;
    const base = chdir ? path.resolve(cwd, chdir) : cwd;
    const root = mainProjectFolder(base);
    if (root && !isProjectWorktreePath(resolvePath(base, target), root)) bad.push({ target, root });
  }
  return bad;
}

function worktreeMessage(bad) {
  const root = bad[0].root;
  return [
    `Worktree path "${bad.map((b) => b.target).join('", "')}" is outside the project's worktree folder.`,
    `Agent worktrees live only in ${path.join(root, '.claude', 'worktrees', '<name>')} (never a sibling or temp folder).`,
    'From the main project folder:',
    '  git worktree add .claude/worktrees/shipping-weights -b feature/shipping-weights origin/develop',
    'From anywhere else, use the full path above. Then work inside that folder.',
    'Full rule: .agents/skills/branch-naming/SKILL.md',
  ].join('\n');
}

function ruleMessage(bad) {
  return [
    `Branch name "${bad.join('", "')}" does not follow the branch rule.`,
    'Use <type>/<short-name>. Types (pick the main change; fix beats refactor, feature beats chore):',
    '  feature/   new feature or visible improvement   feature/shipping-weights',
    '  fix/       a bug or anything broken             fix/sign-in-errors',
    '  hotfix/    urgent fix that ships on its own     hotfix/checkout-total-zero',
    '  refactor/  restructuring, no behaviour change   refactor/order-stage-helpers',
    '  perf/      speed, bundle size, Lighthouse       perf/lazy-load-algolia',
    '  docs/      agent docs, skills, READMEs only     docs/branch-naming-rule',
    '  test/      tests only                           test/order-messages-cases',
    '  chore/     dependencies, config, cleanup        chore/update-angular-deps',
    '  ci/        GitHub Actions and deploy scripts    ci/pr-title-check',
    'Not feat/ or bugfix/: use feature/ and fix/.',
    '<short-name> is 2-5 lowercase words (a-z, 0-9) joined by hyphens, 50 characters at most in total.',
    'No username, Linear id or date: put the Linear id (YOU-123) in the PR title instead.',
    'Rename it and run the command again.',
    'Full rule: .agents/skills/branch-naming/SKILL.md',
  ].join('\n');
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    input = {};
  }
  const command = CURSOR ? input.command : input.tool_input?.command;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const badNames = typeof command === 'string' ? badBranchNames(command) : [];
  const badPaths = typeof command === 'string' ? badWorktreePaths(command, cwd) : [];
  const message = [badNames.length ? ruleMessage(badNames) : '', badPaths.length ? worktreeMessage(badPaths) : '']
    .filter(Boolean)
    .join('\n\n');

  if (CURSOR) {
    const reply = message
      ? { permission: 'deny', user_message: message, agent_message: message }
      : { permission: 'allow' };
    process.stdout.write(JSON.stringify(reply));
    return;
  }
  if (message) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  }
}

main();
