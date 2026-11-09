/**
 * Agent hook (Claude Code PostToolUse on Edit / Write / MultiEdit, wired in `.claude/settings.json`): runs
 * Prettier on the file Claude just changed, so code stays formatted the way `npm run format:check` (part of
 * `npm run preflight`) expects.
 *
 * Only code files (`.ts`, `.html`, `.scss`, `.css`, `.js`, `.mjs`, `.cjs`) inside the repo are formatted.
 * `.prettierignore` still applies, so generated copies, Markdown and JSON are left alone. It never blocks
 * anything: a file Prettier can't parse (half-finished code) is left as it is and the hook exits 0 quietly.
 *
 * Test: echo '{"tool_name":"Edit","tool_input":{"file_path":"src/main.ts"}}' | node scripts/hooks/format-edited-file.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRETTIER = path.join(ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
const CODE = /\.(?:ts|html|scss|css|js|mjs|cjs)$/i;

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath === 'string' && CODE.test(filePath) && existsSync(PRETTIER)) {
    const absolute = path.resolve(ROOT, filePath);
    const relative = path.relative(ROOT, absolute);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && existsSync(absolute)) {
      execFileSync(process.execPath, [PRETTIER, '--write', '--log-level', 'silent', relative], {
        cwd: ROOT,
        stdio: 'ignore',
        timeout: 20_000,
      });
    }
  }
} catch {
  // Never get in the way of an edit: unparsable code, a missing Prettier or bad input all end here.
}
process.exit(0);
