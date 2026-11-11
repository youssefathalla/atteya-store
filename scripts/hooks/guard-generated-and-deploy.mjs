/**
 * Agent hook (Claude Code PreToolUse, wired in `.claude/settings.json`): stops two mistakes before they happen.
 *
 * 1. Edit / Write / MultiEdit / NotebookEdit on a generated copy. These files are overwritten by a sync script
 *    and `npm run preflight` fails when they drift, so the change belongs in the source:
 *    - `.claude/skills/<name>/…`        ← `.agents/skills/<name>/…` (or `.cursor/skills/<name>/…`), `npm run sync:agents`
 *    - `.claude/rules/design-system.md`, `.agents/rules/design-system.md` ← `.cursor/rules/design-system.mdc`, `npm run sync:agents`
 *    - `.agents/workflows/<name>.md`    ← `.cursor/skills/<name>/SKILL.md`, `npm run sync:agents`
 *    - `src/app/core/services/offers/engine/<file>.ts` ← `functions/src/offers/engine/<file>.ts`, `npm run sync:engine`
 *    - `src/app/core/config/<file>.ts`  ← `functions/src/store/<file>.ts` (only files that exist there), `npm run sync:engine`
 * 2. Bash / PowerShell running `firebase deploy` directly. Deploys go through `npm run fb:*` (`scripts/deploy.mjs`),
 *    which runs the branch guard, the index check and the prod confirmation (AGENTS.md, Deploy safety).
 *
 * Reads the hook JSON (`{ tool_name, tool_input }`) on stdin. A blocked call exits 2 with the reason on stderr,
 * which Claude Code feeds back to the agent. Everything else exits 0 with no output. Any error reading the input
 * lets the call through: this hook must never stop work it doesn't understand.
 *
 * Test:
 *   echo '{"tool_name":"Edit","tool_input":{"file_path":".claude/skills/copywriting/SKILL.md"}}' | node scripts/hooks/guard-generated-and-deploy.mjs
 *   echo '{"tool_name":"Bash","tool_input":{"command":"npx firebase deploy --only functions"}}' | node scripts/hooks/guard-generated-and-deploy.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from '../lib/is-main-module.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/** Repo-relative path with forward slashes, or null when the file is outside the repo. */
export function repoPath(filePath, root = ROOT) {
  if (!filePath) return null;
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

/** Where to make the change instead, or null when `relative` is not a generated copy. */
export function sourceFor(relative, root = ROOT) {
  if (!relative) return null;
  const lower = relative.toLowerCase();

  const skill = relative.match(/^\.claude\/skills\/([^/]+)\/(.+)$/i);
  if (skill) {
    const [, name, rest] = skill;
    const owner = existsSync(path.join(root, '.cursor', 'skills', name))
      ? '.cursor/skills'
      : '.agents/skills';
    return { source: `${owner}/${name}/${rest}`, sync: 'npm run sync:agents' };
  }
  if (lower === '.claude/rules/design-system.md' || lower === '.agents/rules/design-system.md') {
    return { source: '.cursor/rules/design-system.mdc', sync: 'npm run sync:agents' };
  }
  const workflow = relative.match(/^\.agents\/workflows\/([^/]+)\.md$/i);
  if (workflow) return { source: `.cursor/skills/${workflow[1]}/SKILL.md`, sync: 'npm run sync:agents' };

  const shared = [
    { copy: 'src/app/core/services/offers/engine/', from: 'functions/src/offers/engine/' },
    { copy: 'src/app/core/config/', from: 'functions/src/store/' },
  ];
  for (const { copy, from } of shared) {
    if (!lower.startsWith(copy)) continue;
    const file = relative.slice(copy.length);
    // Only files the sync script writes: `.ts` straight in that folder that also exist in the source folder.
    if (file.includes('/') || !file.endsWith('.ts')) return null;
    if (!existsSync(path.join(root, from, file))) return null;
    return { source: `${from}${file}`, sync: 'npm run sync:engine' };
  }
  return null;
}

/**
 * The Firebase CLI as a word: `firebase`, `firebase-tools`, with an optional `@version`, a `.cmd` / `.ps1` /
 * `.exe` / `.js` ending, and any path or quote in front (`./node_modules/.bin/firebase`, `"C:\…\firebase.cmd"`).
 * `firebase-guard.mjs` or `src/firebase.ts` don't match: the word must end there.
 */
const FIREBASE_CLI =
  /(?:^|[\s"'`(;&|=\\/])firebase(?:-tools)?(?:@[\w.-]+)?(?:\.(?:cmd|ps1|exe|js|cjs|mjs))?(?=$|[\s"'`);&|])/im;
/** `deploy` as a word, or `deploy:<target>`. `scripts/deploy.mjs` doesn't match. */
const DEPLOY_WORD = /(?:^|[\s"'`(;&|=])deploy(?::[\w,:-]+)?(?=$|[\s"'`);&|])/im;
/**
 * True when the command names the Firebase CLI and also has the word `deploy`, anywhere in its text. On purpose
 * this reads no shell syntax at all (quotes, heredocs, substitutions, wrappers, aliases, flags, line breaks):
 * every way of running a deploy has both words, so none can slip through. A command that only mentions it is
 * blocked too; the message says to write that text to a file first (Write tool, then `git commit -F <file>` or
 * `gh … --body-file <file>`) or to search with the Grep tool.
 *
 * The one exception: the shell deletes a backslash-newline (line continuation) and the backslash in front of a
 * plain character before it runs anything, so `firebase\⏎ deploy`, `fire\⏎base deploy` or `firebase \deploy`
 * still deploy. The text is also checked with those removed; the original is checked too, so Windows paths
 * (`C:\…\firebase.cmd`) still match. PowerShell does the same with a backtick (`` fire`base `deploy ``,
 * backtick-newline) and cmd.exe with a caret (`fire^base deploy`, caret-newline), so those are removed too.
 */
export function isRawDeploy(command) {
  if (typeof command !== 'string') return false;
  // Bash `\`, PowerShell backtick, cmd.exe `^`: each is removed with the line break after it and in front of a
  // plain character, one shell at a time and all together, and every version is checked next to the original.
  // The join-only versions (line breaks removed, other escapes kept) are checked too: a quoted Windows path split
  // by a backslash-newline (`"C:\tools\fire\⏎base.cmd"`) only matches once joined, with its path backslashes left.
  const ESCAPES = ['\\', '`', '^'];
  const join = (text, escape) => text.replace(new RegExp(`\\${escape}\\r?\\n`, 'g'), '');
  const fold = (text, escape) => join(text, escape).replace(new RegExp(`\\${escape}(?=[^\\s])`, 'g'), '');
  const versions = [
    command,
    ...ESCAPES.map((escape) => join(command, escape)),
    ...ESCAPES.map((escape) => fold(command, escape)),
    ESCAPES.reduce(join, command),
    ESCAPES.reduce(fold, command),
  ];
  return versions.some((text) => FIREBASE_CLI.test(text) && DEPLOY_WORD.test(text));
}

/** The reason to block this call, or null to let it through. */
export function blockReason(input, root = ROOT) {
  const tool = input?.tool_name;
  const toolInput = input?.tool_input ?? {};
  if (EDIT_TOOLS.has(tool)) {
    const relative = repoPath(toolInput.file_path ?? toolInput.notebook_path, root);
    const target = sourceFor(relative, root);
    if (!target) return null;
    return (
      `${relative} is a generated copy and gets overwritten. ` +
      `Make this change in ${target.source}, then run \`${target.sync}\` to update the copy.`
    );
  }
  if (SHELL_TOOLS.has(tool) && isRawDeploy(toolInput.command)) {
    return (
      'Raw `firebase deploy` skips the branch guard, the index check and the prod confirmation. ' +
      'Use the npm scripts instead: `npm run fb:fn:dev`, `npm run fb:rules:dev`, `npm run fb:indexes:dev` ' +
      "or `npm run fb:deploy:dev` (prod only with Youssef's OK). See AGENTS.md, Deploy safety. " +
      'If the command only mentions it in text, put that text in a file (`git commit -F <file>`, `gh pr create --body-file <file>`, ' +
      'written with the Write tool first) or search with the Grep tool.'
    );
  }
  return null;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    process.exit(0);
  }
  const reason = blockReason(input);
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) main();
