/**
 * Starts the ticket-pickup routine right away, once per Linear ticket, so several Claude cloud
 * sessions build tickets at the same time (instead of waiting for the hourly schedule).
 *
 *   npm run agent:build -- <KEY>-51 <KEY>-52           (Opus: the default)
 *   npm run agent:build -- --sonnet <KEY>-51           (Sonnet: a normal feature or bug in one area)
 *   npm run agent:build -- --haiku <KEY>-51            (Haiku: a copy fix, one-line or one-file change)
 *   npm run agent:build -- --dry-run <KEY>-51          (shows what it would do, sends nothing)
 *   npm run agent:build -- --help                      (or -h: prints how to use it, starts nothing)
 *
 * Each id becomes one start ("fire") of the routine with the message `Build <id>`. The routine
 * (`.claude/routines/ticket-pickup.md`) reads only the ticket id from that message, then claims,
 * builds and opens a PR exactly like a scheduled run. Nothing is built on this machine.
 *
 * Three routines on claude.ai share that same prompt and differ only in the model:
 *   Opus   (no flag)   trig_01BzzGXbAheJgZo7kqRxGUh8   ATTEYA_ROUTINE_TOKEN          routine-token
 *   Sonnet (--sonnet)  trig_01UwGVcKtQkxrepBwEZEzcJ3   ATTEYA_ROUTINE_TOKEN_SONNET   routine-token-sonnet
 *   Haiku  (--haiku)   trig_01PWLhc1Yzys3h3sKHd1bkmT   ATTEYA_ROUTINE_TOKEN_HAIKU    routine-token-haiku
 * Only the Opus routine runs on the hourly schedule (and is the one Conflict Watch starts); Sonnet
 * and Haiku run only when started here.
 *
 * Tokens: each routine has its own API token, and a token only starts its own routine. Create it
 * once on claude.ai (routine → Edit → Trigger → API → Generate token). It is read from the
 * routine's environment variable above, or from the file of that name in
 * %USERPROFILE%\.atteya-store\ (~/.atteya-store/). Never put a token in the repo and never print
 * it. Limits: 30 starts per hour per routine, 100 per hour per account.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readLinearConfig } from './lib/linear-config.mjs';

/** The ticket-pickup routines (claude.ai/code/routines), one per model. Routine ids are not secrets. */
const MODELS = {
  opus: {
    name: 'Opus',
    routineId: 'trig_01BzzGXbAheJgZo7kqRxGUh8',
    tokenEnv: 'ATTEYA_ROUTINE_TOKEN',
    tokenFileName: 'routine-token',
  },
  sonnet: {
    name: 'Sonnet',
    routineId: 'trig_01UwGVcKtQkxrepBwEZEzcJ3',
    tokenEnv: 'ATTEYA_ROUTINE_TOKEN_SONNET',
    tokenFileName: 'routine-token-sonnet',
  },
  haiku: {
    name: 'Haiku',
    routineId: 'trig_01PWLhc1Yzys3h3sKHd1bkmT',
    tokenEnv: 'ATTEYA_ROUTINE_TOKEN_HAIKU',
    tokenFileName: 'routine-token-haiku',
  },
};
const TOKEN_DIR = join(homedir(), '.atteya-store');
const MAX_TICKETS = 10;

function exit(lines) {
  process.stderr.write(`${lines.join('\n')}\n`);
  process.exit(1);
}

function tokenFile(model) {
  return join(TOKEN_DIR, model.tokenFileName);
}

function fireUrl(model) {
  return `https://api.anthropic.com/v1/claude_code/routines/${model.routineId}/fire`;
}

function readToken(model) {
  const fromEnv = (process.env[model.tokenEnv] ?? '').trim();
  if (fromEnv) return fromEnv;
  const file = tokenFile(model);
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  return '';
}

function setupHelp(model) {
  return [
    `No token found for the ${model.name} routine.`,
    '',
    'One-time setup:',
    `  1. Open https://claude.ai/code/routines/${model.routineId} → Edit → Trigger "+" → API → Generate token.`,
    '     The token is shown once: copy it now. It only starts this routine.',
    `  2. Save it OUTSIDE the project, either as an environment variable (PowerShell):`,
    `       [Environment]::SetEnvironmentVariable('${model.tokenEnv}', '<token>', 'User')`,
    '     then restart Cursor, Claude Code and any terminals,',
    `     or as a file: ${tokenFile(model)}`,
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
    `  npm run agent:build -- --sonnet ${teamKey}-51`,
    '',
    'Model (pick one; all three follow the same steps and run the same checks):',
    '  (no flag)   Opus: anything touching pricing, checkout, orders, rules, functions, or several areas.',
    '  --sonnet    Sonnet: a normal feature or bug in one area.',
    '  --haiku     Haiku: a copy fix, a one-line or one-file change.',
    '',
    'Options:',
    "  --dry-run   Show the model, the routine and whether that model's token was found. Sends nothing.",
    '  --help, -h  Show this help.',
    '',
    `Up to ${MAX_TICKETS} tickets per run. Each ticket gets its own cloud session.`,
    '',
    'Tokens: each model has its own routine and its own token (a token only starts its own routine),',
    'read from the environment variable or from the file in %USERPROFILE%\\.atteya-store\\ (~/.atteya-store/):',
    ...Object.values(MODELS).map(
      (m) => `  ${m.name.padEnd(7)} ${m.tokenEnv.padEnd(29)} ${m.tokenFileName}`,
    ),
    'Run without a token to see the one-time setup steps.',
  ];
}

async function fire(model, token, id) {
  const response = await fetch(fireUrl(model), {
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
  const wantsSonnet = args.includes('--sonnet');
  const wantsHaiku = args.includes('--haiku');
  if (wantsSonnet && wantsHaiku) {
    exit(['Pick one model: --sonnet or --haiku, not both (no flag means Opus). Nothing was started.']);
  }
  const model = wantsSonnet ? MODELS.sonnet : wantsHaiku ? MODELS.haiku : MODELS.opus;

  const idPattern = new RegExp(`^${teamKey}-[0-9]{1,6}$`);
  const ids = [...new Set(args.filter((a) => !a.startsWith('--')).map((a) => a.trim().toUpperCase()))];

  if (ids.length === 0) {
    exit([
      `Usage: npm run agent:build -- [--sonnet | --haiku] ${teamKey}-51 ${teamKey}-52 …   (add --dry-run to preview, --help for more)`,
    ]);
  }
  const bad = ids.filter((id) => !idPattern.test(id));
  if (bad.length) exit([`Not a Linear ticket id: ${bad.join(', ')}. Use ${teamKey}-123.`]);
  if (ids.length > MAX_TICKETS) exit([`At most ${MAX_TICKETS} tickets at once (got ${ids.length}).`]);

  if (dryRun) {
    console.log(
      `Dry run: would start the ${model.name} routine (${model.routineId}) ${ids.length} time(s): ${ids.map((id) => `"Build ${id}"`).join(', ')}.`,
    );
    console.log(
      `${model.name} token ${readToken(model) ? 'found' : 'NOT found'} (${model.tokenEnv} or ${tokenFile(model)}).`,
    );
    return;
  }

  const token = readToken(model);
  if (!token) exit(setupHelp(model));

  let failed = 0;
  for (const id of ids) {
    const result = await fire(model, token, id);
    if (result.ok) {
      console.log(`✓ ${id} (${model.name}): Claude started → ${result.url}`);
    } else {
      failed++;
      console.error(`✖ ${id} (${model.name}): not started: ${result.why}`);
      if (/refused/.test(result.why)) break;
    }
  }
  if (failed === 0) {
    console.log('Each session claims its ticket in Linear, builds it, and opens a PR; the review → fix → merge loop takes it from there.');
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => exit([`agent:build failed: ${error.message}`]));
