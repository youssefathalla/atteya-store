/**
 * Keeps every agent tool's docs aligned with one source of truth.
 *
 *   node scripts/sync-agent-docs.mjs           # write
 *   node scripts/sync-agent-docs.mjs --check   # report drift, exit 1 if any (preflight / CI)
 *
 * Edit ONLY the sources. Everything else is generated and gets overwritten.
 *
 * Contracts and workflows (body mirrored; each tool keeps its own YAML front matter dialect):
 *   - `.cursor/rules/design-system.mdc`  → `.agents/rules/design-system.md` (Antigravity)
 *                                        → `.claude/rules/design-system.md` (Claude Code)
 *   - `.cursor/skills/ask|teacher/SKILL.md` → `.agents/workflows/ask|teacher.md` (Antigravity)
 *
 * Skills (whole folders copied byte for byte, so `references/` and `scripts/` come along):
 *   - `.agents/skills/<name>/` → `.claude/skills/<name>/`  (Cursor and Antigravity read the source directly)
 *   - `.cursor/skills/<name>/` → `.claude/skills/<name>/`  (Cursor-only skills: sync-docs, ask, teacher)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

const CHECK_ONLY = process.argv.includes('--check');

/** @type {{ from: string; to: string }[]} */
const BODY_ONLY = [
  { from: '.cursor/rules/design-system.mdc', to: '.agents/rules/design-system.md' },
  { from: '.cursor/rules/design-system.mdc', to: '.claude/rules/design-system.md' },
  { from: '.cursor/skills/ask/SKILL.md', to: '.agents/workflows/ask.md' },
  { from: '.cursor/skills/teacher/SKILL.md', to: '.agents/workflows/teacher.md' },
];

/** Skill roots that feed `.claude/skills/`. */
const SKILL_SOURCES = ['.agents/skills', '.cursor/skills'];
const CLAUDE_SKILLS = '.claude/skills';

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const changed = [];
const problems = [];

const read = (p) => readFileSync(p, 'utf8');
const label = (p) => p.split(sep).join('/');

/** Same bytes once Windows line endings are ignored. */
const sameBytes = (a, b) => Buffer.compare(stripCr(a), stripCr(b)) === 0;
const stripCr = (buffer) => Buffer.from(buffer.filter((byte) => byte !== 0x0d));

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
    return problems.push(`${to}: destination missing — create it with that tool's front matter first`);

  const source = splitFrontMatter(read(from), from);
  const destination = splitFrontMatter(read(to), to);
  if (!source || !destination) return;

  const merged = destination.frontMatter + source.body;
  if (!sameBytes(Buffer.from(merged), Buffer.from(read(to)))) {
    changed.push(to);
    write(to, merged);
  }
}

/** Every file under `dir`, as paths relative to it. */
function listFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(join(dir, entry.name), relative) : [relative];
  });
}

/** Makes `to` an exact copy of `from`: copies new or changed files, removes files the source no longer has. */
function mirrorDir(from, to) {
  const sourceFiles = listFiles(from);
  for (const file of sourceFiles) {
    const sourcePath = join(from, file);
    const destinationPath = join(to, file);
    const bytes = readFileSync(sourcePath);
    if (!existsSync(destinationPath) || !sameBytes(bytes, readFileSync(destinationPath))) {
      changed.push(destinationPath);
      write(destinationPath, bytes);
    }
  }
  const keep = new Set(sourceFiles);
  for (const file of listFiles(to)) {
    if (keep.has(file)) continue;
    const stalePath = join(to, file);
    changed.push(`${stalePath} (removed: no longer in ${label(from)})`);
    if (!CHECK_ONLY) rmSync(stalePath);
  }
}

function syncClaudeSkills() {
  /** @type {Map<string, string>} skill name → source folder */
  const owners = new Map();
  for (const root of SKILL_SOURCES) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!existsSync(join(root, entry.name, 'SKILL.md'))) {
        problems.push(`${root}/${entry.name}: folder has no SKILL.md`);
        continue;
      }
      if (owners.has(entry.name)) {
        problems.push(`skill "${entry.name}" exists in both ${owners.get(entry.name)} and ${root}`);
        continue;
      }
      owners.set(entry.name, join(root, entry.name));
    }
  }

  for (const [name, from] of owners) mirrorDir(from, join(CLAUDE_SKILLS, name));

  // A skill folder with no source would be silently lost or drift forever, so flag it.
  if (existsSync(CLAUDE_SKILLS)) {
    for (const entry of readdirSync(CLAUDE_SKILLS, { withFileTypes: true })) {
      if (entry.isDirectory() && !owners.has(entry.name)) {
        problems.push(
          `${CLAUDE_SKILLS}/${entry.name}: no source. Create it in .agents/skills/ (or .cursor/skills/ for Cursor-only), then sync`,
        );
      }
    }
  }
}

BODY_ONLY.forEach(syncBodyOnly);
syncClaudeSkills();

if (problems.length) {
  console.error('Problems:');
  problems.forEach((p) => console.error(`   ${p}`));
}

if (changed.length === 0) {
  console.log('Agent docs are in sync: .agents/ and .claude/ match their .agents/ and .cursor/ sources');
} else if (CHECK_ONLY) {
  console.error(
    `\n${changed.length} file(s) out of sync. Edit only the sources (.agents/skills, .cursor/*), then run: npm run sync:agents`,
  );
  changed.forEach((f) => console.error(`   ${label(f)}`));
} else {
  console.log(`Synced ${changed.length} file(s):`);
  changed.forEach((f) => console.log(`   ${label(f)}`));
}

const failed = problems.length > 0 || (CHECK_ONLY && changed.length > 0);
process.exit(failed ? 1 : 0);
