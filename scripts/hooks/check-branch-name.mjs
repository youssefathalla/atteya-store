/**
 * Agent hook: blocks creating or renaming a git branch whose name breaks the house rule
 * (see `.agents/skills/branch-naming/SKILL.md`): `<type>/<short-name>`, where type is one of
 * feature, fix, hotfix, refactor, perf, docs, test, chore, ci (`feat/` and `bugfix/` are not allowed)
 * and `<short-name>` is 2-5 lowercase words (a-z, 0-9) joined by single hyphens, 50 characters at most in total,
 * with no Linear id (`<key>-123`; the id goes in the PR title). The current and retired team keys come from
 * `linear.config.json`, so a Linear key change needs no edit here.
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
 * It also blocks `gh pr create` / `gh pr edit` with a `--title` / `-t` that has no Linear id
 * (`<KEY>-123` with the current key): the PR title is what links a PR to Linear. A title built from
 * a variable, or `gh pr create --fill` (title from the commit), passes here; the `PR Title` check on
 * GitHub still catches it.
 *
 * Importing this file (the pre-push hook does) runs nothing: `main()` runs only when it is invoked directly.
 *
 * Test: echo '{"tool_input":{"command":"git switch -c my-branch"}}' | node scripts/hooks/check-branch-name.mjs
 *       echo '{"tool_input":{"command":"gh pr create --title \"Fix it\""}}' | node scripts/hooks/check-branch-name.mjs
 */
import { readFileSync } from 'node:fs';
import { allTeamKeysOrEmpty, readLinearConfig } from '../lib/linear-config.mjs';
import { isMainModule } from '../lib/is-main-module.mjs';

const CURSOR = process.argv.includes('--cursor');
const MAX_LENGTH = 50;
const EXEMPT = new Set(['main', 'develop']);
const TYPES = ['feature', 'fix', 'hotfix', 'refactor', 'perf', 'docs', 'test', 'chore', 'ci'];
const PREFIXES = TYPES.map((type) => `${type}/`);
const MIN_WORDS = 2;
const MAX_WORDS = 5;
const WORD = /^[a-z0-9]+$/;
const DIGITS = /^[0-9]+$/;
/** Current and retired Linear team keys in lowercase (`ats`, `you`), from `linear.config.json`. */
const TEAM_KEYS = allTeamKeysOrEmpty().map((key) => key.toLowerCase());
/** The current key for messages; `KEY` when the config can't be read. */
const CURRENT_KEY = TEAM_KEYS[0]?.toUpperCase() ?? 'KEY';
/** The Linear workspace slug for issue links; a placeholder when the config can't be read. */
const WORKSPACE = (() => {
  try {
    return readLinearConfig().workspace || '<workspace>';
  } catch {
    return '<workspace>';
  }
})();

/** True when the short-name words carry a Linear id (`<key>-123` or `<key>123`), which belongs in the PR title. */
function hasLinearId(words) {
  return words.some((word, i) =>
    TEAM_KEYS.some(
      (key) =>
        (word === key && DIGITS.test(words[i + 1] ?? '')) ||
        (word.startsWith(key) && DIGITS.test(word.slice(key.length))),
    ),
  );
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
  '-d',
  '-D',
  '--delete',
  '-l',
  '--list',
  '-a',
  '--all',
  '-r',
  '--remotes',
  '-v',
  '-vv',
  '--verbose',
  '--show-current',
  '--contains',
  '--no-contains',
  '--merged',
  '--no-merged',
  '--points-at',
  '--format',
  '--sort',
  '-u',
  '--set-upstream-to',
  '--unset-upstream',
  '--edit-description',
  '--column',
  '--no-column',
]);
const BRANCH_RENAME_FLAGS = new Set(['-m', '-M', '--move', '-c', '-C', '--copy']);

/** The words after `git` (skipping git's own options), starting at the subcommand, or null. */
function gitArgs(words) {
  let i = 0;
  // Skip env assignments (`FOO=1 git ...`) and PowerShell's call operator.
  while (i < words.length && (words[i].includes('=') || words[i] === '&')) i++;
  const program = (words[i] ?? '').toLowerCase().replaceAll('\\', '/');
  if (
    program !== 'git' &&
    program !== 'git.exe' &&
    !program.endsWith('/git') &&
    !program.endsWith('/git.exe')
  ) {
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
  if (sub === 'switch')
    return [flagValue(rest, ['-c', '-C', '--create', '--force-create', '--orphan'])].filter(Boolean);
  if (sub === 'worktree' && rest[0] === 'add')
    return [flagValue(rest.slice(1), ['-b', '-B'])].filter(Boolean);

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

/** True when `text` contains a Linear id with the current team key (`<KEY>-123`, key from linear.config.json), as the PR title check on GitHub requires. */
export function hasCurrentLinearId(text) {
  const key = TEAM_KEYS[0]?.toUpperCase();
  if (!key) return true; // Config unreadable: never block every PR.
  return new RegExp(`(^|[^A-Za-z0-9])${key}-[0-9]+`).test(text);
}

/** The words after `gh` for `gh pr create|edit`, or null. */
function ghPrArgs(words) {
  let i = 0;
  while (i < words.length && (words[i].includes('=') || words[i] === '&')) i++;
  const program = (words[i] ?? '').toLowerCase().replaceAll('\\', '/');
  if (program !== 'gh' && program !== 'gh.exe' && !program.endsWith('/gh') && !program.endsWith('/gh.exe'))
    return null;
  const args = words.slice(i + 1);
  if (args[0] !== 'pr' || !['create', 'edit'].includes(args[1])) return null;
  return args.slice(2);
}

/** PR titles in `command` (`gh pr create|edit --title/-t`) with no Linear id. Titles built from variables pass. */
export function badPrTitles(command) {
  return splitCommands(command)
    .map(ghPrArgs)
    .filter(Boolean)
    .map((args) => flagValue(args, ['--title', '-t']))
    .filter((title) => typeof title === 'string')
    .filter((title) => !title.includes('$') && !title.includes('%'))
    .filter((title) => !hasCurrentLinearId(title));
}

function prTitleMessage(bad) {
  return [
    `PR title "${bad.join('", "')}" has no Linear issue id.`,
    `Start the title with the issue id, e.g. "${CURRENT_KEY}-123 Clear sign-in errors on mode switch" (several: "${CURRENT_KEY}-31 ${CURRENT_KEY}-32 ...").`,
    'No issue yet? Find or create it in Linear first (AGENTS.md section 2), then use its id.',
    `The description's first line should be a link to the issue: "Linear: [${CURRENT_KEY}-123](https://linear.app/${WORKSPACE}/issue/${CURRENT_KEY}-123)". Never write "Fixes" or "Closes" before the id.`,
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
    `No username, Linear id or date: put the Linear id (${CURRENT_KEY}-123) in the PR title instead.`,
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
  const badNames = typeof command === 'string' ? badBranchNames(command) : [];
  const badTitles = typeof command === 'string' ? badPrTitles(command) : [];
  const message = [
    badNames.length ? ruleMessage(badNames) : '',
    badTitles.length ? prTitleMessage(badTitles) : '',
  ]
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

if (isMainModule(import.meta.url)) main();
