/**
 * Pure helper: failed sign-in feedback on /login must sit below the password field.
 * Used by preflight and runnable as `node scripts/login-error-placement.mjs`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} html login.component.html contents
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkLoginErrorPlacement(html) {
  const passwordOpen = html.indexOf('<app-password-input');
  if (passwordOpen < 0) {
    return { ok: false, reason: 'Missing <app-password-input> on the login form.' };
  }

  const afterPassword = html.slice(passwordOpen);
  const passwordCloseRel = afterPassword.search(/\/>/);
  if (passwordCloseRel < 0) {
    return { ok: false, reason: 'Could not find the end of <app-password-input>.' };
  }
  const passwordEnd = passwordOpen + passwordCloseRel + 2;

  const alertBlocks = [
    ...html.matchAll(/@if\s*\(\s*shownError\(\)\s*\)\s*\{[\s\S]*?role="alert"[\s\S]*?\}/g),
  ];
  if (alertBlocks.length === 0) {
    return {
      ok: false,
      reason: 'Missing shownError() alert on the login page.',
    };
  }
  if (alertBlocks.length > 1) {
    return {
      ok: false,
      reason: `Expected one shownError() alert, found ${alertBlocks.length}.`,
    };
  }

  const alertIndex = alertBlocks[0].index ?? -1;
  if (alertIndex < passwordEnd) {
    return {
      ok: false,
      reason: 'shownError() alert must appear below the password field, not above it.',
    };
  }

  const formIndex = html.indexOf('<form');
  if (formIndex < 0 || alertIndex < formIndex) {
    return {
      ok: false,
      reason: 'shownError() alert must stay inside the sign-in form, below the password field.',
    };
  }

  return { ok: true };
}

/** Fixture assertions for the pure helper (no Angular test runner). */
export function assertLoginErrorPlacementHelper() {
  const good = `
<form>
  <app-password-input label="Password" />
  @if (shownError()) {
    <p class="font-body-sm text-error" role="alert">{{ shownError() }}</p>
  }
</form>`;
  const badTop = `
@if (shownError()) {
  <p role="alert">{{ shownError() }}</p>
}
<form>
  <app-password-input label="Password" />
</form>`;

  const goodResult = checkLoginErrorPlacement(good);
  if (!goodResult.ok) {
    throw new Error(`Expected good fixture to pass: ${goodResult.reason}`);
  }
  const badResult = checkLoginErrorPlacement(badTop);
  if (badResult.ok) {
    throw new Error('Expected top-of-page error fixture to fail.');
  }
}

export function assertLoginTemplateErrorPlacement(cwd = process.cwd()) {
  assertLoginErrorPlacementHelper();
  const file = path.resolve(cwd, 'src/app/features/auth/login/login.component.html');
  const result = checkLoginErrorPlacement(fs.readFileSync(file, 'utf8'));
  if (!result.ok) {
    throw new Error(`${path.relative(cwd, file)}: ${result.reason}`);
  }
  return file;
}

const isDirectRun =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    assertLoginTemplateErrorPlacement();
    console.log('[login-error-placement] ok: shownError sits below the password field.');
  } catch (error) {
    console.error(`[login-error-placement] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
