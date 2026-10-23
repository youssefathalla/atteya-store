/**
 * Single Firebase deploy runner: guard, index check, summary, prod confirm, deploy.
 * Usage: node scripts/deploy.mjs <dev|prod> <comma-separated targets>
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { runGuard } from './firebase-guard.mjs';
import { checkIndexes } from './check-indexes.mjs';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const VALID_TARGET = /^(firestore|firestore:rules|firestore:indexes|storage|functions(:[\w-]+)?)$/;

const alias = process.argv[2];
const targetsRaw = process.argv[3];

if (process.argv.includes('--force')) {
  console.error(`${RED}✖ Deploy blocked:${RESET} --force is not allowed. Remove it and retry.`);
  process.exit(1);
}

if (!alias || (alias !== 'dev' && alias !== 'prod') || !targetsRaw) {
  console.error(
    `${RED}Usage:${RESET} node scripts/deploy.mjs <dev|prod> <targets>\n` +
      '  targets: firestore, firestore:rules, firestore:indexes, storage, functions, or functions:<name> (comma-separated)',
  );
  process.exit(1);
}

const targets = targetsRaw.split(',').map((t) => t.trim()).filter(Boolean);
if (!targets.length) {
  console.error(`${RED}✖ Deploy blocked:${RESET} no deploy targets specified.`);
  process.exit(1);
}

for (const t of targets) {
  if (!VALID_TARGET.test(t)) {
    console.error(`${RED}✖ Deploy blocked:${RESET} invalid target "${t}".`);
    process.exit(1);
  }
}

const touchesIndexes = targets.some((t) => t === 'firestore' || t === 'firestore:indexes');

const guard = runGuard();
if (!guard.ok) process.exit(1);

if (touchesIndexes) {
  const indexReport = checkIndexes(alias);
  if (!indexReport.ok) process.exit(1);
}

const firebaserc = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '.firebaserc'), 'utf8'));
const projectId = firebaserc.projects?.[alias];
if (!projectId) {
  console.error(`${RED}✖ Deploy blocked:${RESET} no project for alias "${alias}" in .firebaserc`);
  process.exit(1);
}

const logResult = spawnSync('git', ['log', '-1', '--format=%h %s'], { encoding: 'utf8', shell: false });
const commitLine = (logResult.stdout ?? '').trim() || '(unknown commit)';

console.log(`\n${CYAN}── Deploy summary ──${RESET}`);
console.log(`Project:  ${projectId} (${alias})`);
console.log(`Commit:   ${commitLine}`);
console.log('Targets:');
for (const t of targets) console.log(`  • ${t}`);
console.log(`${YELLOW}Answer N to any delete prompt unless it was agreed in the plan.${RESET}\n`);

if (alias === 'prod') {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`Type "prod" to deploy to ${projectId}: `);
  rl.close();
  if (answer.trim() !== 'prod') {
    console.log('Cancelled, nothing deployed.');
    process.exit(0);
  }
}

const onlyArg = targets.join(',');
const deployResult = spawnSync('firebase', ['deploy', '--only', onlyArg, '-P', alias], {
  stdio: 'inherit',
  shell: true,
});

if (deployResult.status !== 0) {
  process.exit(deployResult.status ?? 1);
}

if (touchesIndexes) {
  console.log(`\n${CYAN}── Post-deploy index report ──${RESET}`);
  const post = checkIndexes(alias);
  if (post.building.length) {
    console.log(`${YELLOW}Some indexes are still building; this can take a few minutes.${RESET}\n`);
  }
}

process.exit(0);
