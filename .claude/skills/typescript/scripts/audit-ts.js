/**
 * TypeScript convention audit.
 *
 * Run from the repository root; the directory argument is required:
 *   node .agents/skills/typescript/scripts/audit-ts.js src/app
 */
import fs from 'node:fs';
import path from 'node:path';

const BANNED = [
  { regex: /:\s*any\b|\bas any\b|<any>/, msg: "❌ Forbidden: 'any'. Use 'unknown' + a type guard." },
  {
    // Fields only — `private someMethod()` is fine, `private someField =` is not.
    regex: /\bprivate\s+(?:readonly\s+)?\w+\s*[:=]/,
    msg: "⚠️ Legacy field: use '#field' instead of 'private' (or 'protected' if the template reads it).",
  },
  {
    // Public API only. `protected readonly x = signal()` is legitimate component-local state.
    regex: /^\s*(?:public\s+)?readonly\s+\w+\s*=\s*signal[<(]/,
    msg: '⚠️ Public writable signal: expose it via .asReadonly() and mutate through a method.',
  },
];

/** Crude single-line comment filter — good enough to avoid flagging documentation. */
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.angular', '.git']);

let findings = 0;

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) scan(full);
      continue;
    }

    if (!full.endsWith('.ts') && !full.endsWith('.html')) continue;

    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isComment(line)) return;

      for (const check of BANNED) {
        if (check.regex.test(line)) {
          findings += 1;
          console.log(`${check.msg}\n   ${full}:${index + 1}\n   ${line.trim()}`);
        }
      }
    });
  }
}

const target = process.argv[2];

if (!target || target === '--help') {
  console.log('Usage: node audit-ts.js <directory>   e.g. node audit-ts.js src/app');
  process.exit(0);
}

if (!fs.existsSync(target)) {
  console.error(`Directory not found: ${target}`);
  process.exit(1);
}

scan(target);
console.log(findings === 0 ? '✅ No violations found.' : `\n${findings} finding(s).`);
