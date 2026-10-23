/**
 * Keeps Antigravity-facing docs in `.agents/` aligned with Cursor sources.
 *
 *   node scripts/sync-agent-docs.mjs           # write
 *   node scripts/sync-agent-docs.mjs --check   # report drift, exit 1 if any (CI)
 *
 * Body content is mirrored; each tool keeps its own YAML front matter dialect.
 *
 * Source of truth for contract bodies:
 *   - `.cursor/rules/design-system.mdc` → `.agents/rules/design-system.md`
 *   - `.cursor/skills/ask|teacher/SKILL.md` → `.agents/workflows/ask|teacher.md`
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, sep } from 'node:path';

const CHECK_ONLY = process.argv.includes('--check');

/** @type {{ from: string; to: string }[]} */
const BODY_ONLY = [
  { from: '.cursor/rules/design-system.mdc', to: '.agents/rules/design-system.md' },
  { from: '.cursor/skills/ask/SKILL.md', to: '.agents/workflows/ask.md' },
  { from: '.cursor/skills/teacher/SKILL.md', to: '.agents/workflows/teacher.md' },
];

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const changed = [];
const problems = [];

const read = (p) => readFileSync(p, 'utf8');

function splitFrontMatter(text, label) {
  const match = text.match(FRONT_MATTER);
  if (!match) {
    problems.push(`${label}: no YAML front matter found`);
    return null;
  }
  return { frontMatter: match[0], body: text.slice(match[0].length) };
}

function write(destination, contents) {
  if (CHECK_ONLY) return;
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function syncBodyOnly({ from, to }) {
  if (!existsSync(from)) return problems.push(`${from}: source missing`);
  if (!existsSync(to))
    return problems.push(`${to}: destination missing — create it with Antigravity front matter first`);

  const source = splitFrontMatter(read(from), from);
  const destination = splitFrontMatter(read(to), to);
  if (!source || !destination) return;

  const merged = destination.frontMatter + source.body;
  if (merged !== read(to)) {
    changed.push(to);
    write(to, merged);
  }
}

BODY_ONLY.forEach(syncBodyOnly);

const label = (p) => p.split(sep).join('/');

if (problems.length) {
  console.error('Problems:');
  problems.forEach((p) => console.error(`   ${p}`));
}

if (changed.length === 0) {
  console.log('.agents/ mirrors are in sync with .cursor/ sources');
} else if (CHECK_ONLY) {
  console.error(`\n${changed.length} file(s) out of sync. Run: npm run sync:agents`);
  changed.forEach((f) => console.error(`   ${label(f)}`));
} else {
  console.log(`Synced ${changed.length} file(s):`);
  changed.forEach((f) => console.log(`   ${label(f)}`));
}

const failed = problems.length > 0 || (CHECK_ONLY && changed.length > 0);
process.exit(failed ? 1 : 0);
