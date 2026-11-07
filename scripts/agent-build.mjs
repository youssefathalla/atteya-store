/**
 * Starts the ticket-pickup routine right away, once per Linear ticket, so several Claude cloud
 * sessions build tickets at the same time (instead of waiting for the 2-hour schedule).
 *
 *   npm run agent:build -- <KEY>-51 <KEY>-52
 *   npm run agent:build -- --dry-run <KEY>-51      (shows what it would do, sends nothing)
 *   npm run agent:build -- --help                  (or -h: prints how to use it, starts nothing)
 *
 * Each id becomes one start ("fire") of the routine with the message `Build <id>`. The routine
 * (`.claude/routines/ticket-pickup.md`) reads only the ticket id from that message, then claims,
 * builds and opens a PR exactly like a scheduled run. Nothing is built on this machine.
 *
 * Token: the routine's API token, created once on claude.ai (routine → Edit → Trigger → API →
 * Generate token). It is read from the ATTEYA_ROUTINE_TOKEN environment variable, or from
 * %USERPROFILE%\.atteya-store\routine-token (~/.atteya-store/routine-token). Never put it in
 * the repo. Limits: 30 starts per hour per routine, 100 per hour per account.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readLinearConfig } from './lib/linear-config.mjs';

/** The "Atteya Store: pick up agent-ready ticket" routine (claude.ai/code/routines). Not a secret. */
const ROUTINE_ID = 'trig_01BzzGXbAheJgZo7kqRxGUh8';
const FIRE_URL = `https://api.anthropic.com/v1/claude_code/routines/${ROUTINE_ID}/fire`;
const TOKEN_ENV = 'ATTEYA_ROUTINE_TOKEN';
const TOKEN_FILE = join(homedir(), '.atteya-store', 'routine-token');
const MAX_TICKETS = 10;

function exit(lines) {
  process.stderr.write(`${lines.join('\n')}\n`);
  process.exit(1);
}

function readToken() {
  const fromEnv = (process.env[TOKEN_ENV] ?? '').trim();
  if (fromEnv) return fromEnv;
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, 'utf8').trim();
  return '';
}

function setupHelp() {
  return [
    'No routine token found.',
    '',
    'One-time setup:',
    `  1. Open https://claude.ai/code/routines/${ROUTINE_ID} → Edit → Trigger "+" → API → Generate token.`,
    '     The token is shown once: copy it now.',
    `  2. Save it OUTSIDE the project, either as an environment variable (PowerShell):`,
    `       [Environment]::SetEnvironmentVariable('${TOKEN_ENV}', '<token>', 'User')`,
    '     then restart Cursor, Claude Code and any terminals,',
    `     or as a file: ${TOKEN_FILE}`,
    '  Never commit it. Generating a new token revokes the old one.',
  ];
}

/** Printed for --help / -h. Reads no token and starts nothing. */
function usageHelp(teamKey) {
  return [
    'Start the Claude ticket routine right away, once per Linear ticket.',
    '',
    'Usage:',
    `  npm run agent:build -- ${teamKey}-51 ${teamKey}-52`,
    '',
    'Options:',
    '  --dry-run   Show what would be started and whether a token was found. Sends nothing.',
    '  --help, -h  Show this help.',
    '',
    `Up to ${MAX_TICKETS} tickets per run. Each ticket gets its own cloud session.`,
    '',
    'Token: read from the environment variable',
    `  ${TOKEN_ENV}`,
    'or from the file',
    '  %USERPROFILE%\\.atteya-store\\routine-token   (~/.atteya-store/routine-token)',
    'Run without a token to see the one-time setup steps.',
  ];
}

async function fire(token, id) {
  const response = await fetch(FIRE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: `Build ${id}` }),
  });
  if (response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: true, url: data.claude_code_session_url ?? '(no link returned)' };
  }
  const retry = response.headers.get('retry-after');
  const body = (await response.text().catch(() => '')).slice(0, 300);
  const why =
    response.status === 401 || response.status === 403
      ? 'the token was refused (wrong, revoked, or for another routine)'
      : response.status === 429
        ? `too many starts right now${retry ? `; try again in ${retry} s` : ''} (30/hour per routine)`
        : `HTTP ${response.status} ${body}`;
  return { ok: false, why };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const { teamKey } = readLinearConfig();
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usageHelp(teamKey).join('\n'));
    return;
  }
  const idPattern = new RegExp(`^${teamKey}-[0-9]{1,6}$`);
  const ids = [...new Set(args.filter((a) => !a.startsWith('--')).map((a) => a.trim().toUpperCase()))];

  if (ids.length === 0) {
    exit([`Usage: npm run agent:build -- ${teamKey}-51 ${teamKey}-52 …   (add --dry-run to preview)`]);
  }
  const bad = ids.filter((id) => !idPattern.test(id));
  if (bad.length) exit([`Not a Linear ticket id: ${bad.join(', ')}. Use ${teamKey}-123.`]);
  if (ids.length > MAX_TICKETS) exit([`At most ${MAX_TICKETS} tickets at once (got ${ids.length}).`]);

  if (dryRun) {
    console.log(`Dry run: would start the routine ${ids.length} time(s): ${ids.map((id) => `"Build ${id}"`).join(', ')}.`);
    console.log(`Token ${readToken() ? 'found' : 'NOT found'} (${TOKEN_ENV} or ${TOKEN_FILE}).`);
    return;
  }

  const token = readToken();
  if (!token) exit(setupHelp());

  let failed = 0;
  for (const id of ids) {
    const result = await fire(token, id);
    if (result.ok) {
      console.log(`✓ ${id}: Claude started → ${result.url}`);
    } else {
      failed++;
      console.error(`✖ ${id}: not started: ${result.why}`);
      if (/refused/.test(result.why)) break;
    }
  }
  if (failed === 0) {
    console.log('Each session claims its ticket in Linear, builds it, and opens a PR; the review → fix → merge loop takes it from there.');
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => exit([`agent:build failed: ${error.message}`]));
