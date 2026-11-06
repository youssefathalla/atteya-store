/**
 * Preflight: keeps agent docs, hooks and workflows free of a hard-coded Linear team key.
 *
 *   node scripts/check-linear-key.mjs
 *
 * Validates `linear.config.json`, then fails when a doc names an issue with the current key
 * (write `<KEY>-123` and point at `linear.config.json` instead) or with a retired key from
 * `previousTeamKeys` (left over from before a rename). Commit history and Linear itself are not checked.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readLinearConfig } from './lib/linear-config.mjs';

/** Agent docs and the scripts/workflows they describe. Generated `.claude/` copies are covered by sync:agents. */
const ROOTS = ['AGENTS.md', 'README.md', '.agents', '.cursor', '.github', 'scripts/hooks'];
const TEXT_FILE = /\.(md|mdc|mjs|js|json|ya?ml)$/;

function listFiles(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => listFiles(join(path, name)));
}

let config;
try {
  config = readLinearConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const keys = [config.teamKey, ...config.previousTeamKeys];
// `YOU-123`, `YOU-<number>` and lowercase branch-style `you-123`, but not words that merely contain the key.
const pattern = new RegExp(`(?<![A-Za-z0-9])(${keys.join('|')})-(\\d+|<number>)`, 'gi');

const problems = [];
for (const file of ROOTS.flatMap(listFiles).filter((f) => TEXT_FILE.test(f))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const match of line.matchAll(pattern)) problems.push(`${file}:${i + 1}: ${match[0]}`);
    });
}

if (problems.length) {
  console.error('Hard-coded Linear issue ids found. Write <KEY>-123 and point at teamKey in linear.config.json:');
  problems.forEach((p) => console.error(`   ${p}`));
  process.exit(1);
}
console.log(`Linear key check passed: docs use <KEY> (teamKey ${config.teamKey} in linear.config.json)`);
