/**
 * Agent hook: blocks creating or renaming a git branch whose name breaks the house rule
 * (see `.agents/skills/branch-naming/SKILL.md`): `<type>/<short-name>`, where type is one of
 * feature, fix, hotfix, refactor, perf, docs, test, chore, ci (`feat/` and `bugfix/` are not allowed)
 * and `<short-name>` is 2-5 lowercase words (a-z, 0-9) joined by single hyphens, 50 characters at most in total,
 * with no Linear id (`you-123`; the id goes in the PR title).
 * `main` and `develop` are exempt.
 *
 * Claude Code (PreToolUse on Bash and PowerShell, wired in `.claude/settings.json`):
 *   reads `{ tool_input: { command } }` on stdin. A bad name exits 2 with the rule on stderr,
 *   which Claude Code feeds back to the agent. Everything else exits 0 with no output.
 *
 * Cursor (`beforeShellExecution`, wired in `.cursor/hooks.json` with `--cursor`):
 *   reads `{ command }` on stdin and always prints `{ "permission": "allow" | "deny", ... }` on stdout.
 *
 * Detected: `git checkout -b|-B|--orphan <name>`, `git switch -c|-C|--create|--force-create|--orphan <name>`,
 * `git branch <name> [start]`, `git branch -m|-M|-c|-C [old] <new>`, `git worktree add ... -b|-B <name>`.
 * Listing and deleting (`git branch`, `-a`, `--list`, `-d`, `-D`, ...) are never blocked.
 *
 * Test: echo '{"tool_input":{"command":"git switch -c my-branch"}}' | node scripts/hooks/check-branch-name.mjs
 */
import { readFileSync } from 'node:fs';

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

/** The words after `git` (skipping git's own options), starting at the subcommand, or null. */
function gitArgs(words) {
  let i = 0;
  // Skip env assignments (`FOO=1 git ...`) and PowerShell's call operator.
  while (i < words.length && (words[i].includes('=') || words[i] === '&')) i++;
  const program = (words[i] ?? '').toLowerCase().replaceAll('\\', '/');
  if (program !== 'git' && program !== 'git.exe' && !program.endsWith('/git') && !program.endsWith('/git.exe')) {
    return null;
  }
  i++;
  while (i < words.length && words[i].startsWith('-')) {
    i += GIT_VALUE_OPTIONS.has(words[i]) ? 2 : 1;
  }
  return words.slice(i);
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
  const bad = typeof command === 'string' ? badBranchNames(command) : [];

  if (CURSOR) {
    const reply = bad.length
      ? { permission: 'deny', user_message: ruleMessage(bad), agent_message: ruleMessage(bad) }
      : { permission: 'allow' };
    process.stdout.write(JSON.stringify(reply));
    return;
  }
  if (bad.length) {
    process.stderr.write(`${ruleMessage(bad)}\n`);
    process.exitCode = 2;
  }
}

main();
