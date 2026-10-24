/**
 * Environment-Aware Angular Build Dispatcher for Firebase App Hosting
 *
 * Detects whether the current App Hosting backend or local runner is targeting
 * the 'dev' (atteya-store-dev) or 'prod' (attiya-store) environment, and
 * executes `ng build` with the corresponding configuration.
 * The Firebase project id decides the configuration; any mismatch fails the build.
 */

import { execSync } from 'node:child_process';

/** Firebase project id → the only Angular configuration it may be built with. */
const PROJECT_CONFIG = {
  'attiya-store': 'production',
  'atteya-store-dev': 'dev',
};

function fail(message) {
  console.error(`\x1b[31m[BUILD CONFIG ERROR]\x1b[0m ${message}`);
  process.exit(1);
}

function normalizeConfig(value) {
  const v = value?.trim().toLowerCase();
  if (v === 'prod' || v === 'production') return 'production';
  if (v === 'dev' || v === 'development') return 'dev';
  return undefined;
}

/** Project id App Hosting exposes at build time (FIREBASE_CONFIG JSON), with gcloud fallbacks. */
function resolveProjectId() {
  const firebaseConfig = process.env.FIREBASE_CONFIG?.trim();
  if (firebaseConfig) {
    let projectId;
    try {
      projectId = JSON.parse(firebaseConfig).projectId;
    } catch {
      fail('FIREBASE_CONFIG is set but is not valid JSON; cannot tell which Firebase project is building.');
    }
    if (projectId) return { id: projectId, source: 'FIREBASE_CONFIG.projectId' };
  }

  for (const name of ['GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT']) {
    const id = process.env[name]?.trim();
    if (id) return { id, source: name };
  }

  return undefined;
}

/** Requested configuration: CLI arg (`node scripts/build.mjs prod|dev`) or APP_HOSTING_ENV. */
function resolveRequested() {
  const arg = process.argv[2];
  const appHostingEnv = process.env.APP_HOSTING_ENV;
  const [raw, source] =
    arg !== undefined
      ? [arg, `CLI argument "${arg}"`]
      : appHostingEnv
        ? [appHostingEnv, `APP_HOSTING_ENV="${appHostingEnv}"`]
        : [undefined, undefined];

  if (raw === undefined) return undefined;

  const config = normalizeConfig(raw);
  if (!config) fail(`Unknown ${source}. Use "dev" or "prod".`);
  return { config, source };
}

function resolveBuildConfig() {
  const requested = resolveRequested();
  const project = resolveProjectId();

  // 1. A known Firebase project decides; any disagreement fails the build.
  if (project) {
    const expected = PROJECT_CONFIG[project.id];
    if (!expected) {
      fail(
        `Unknown Firebase project "${project.id}" (from ${project.source}). ` +
          `Expected one of: ${Object.keys(PROJECT_CONFIG).join(', ')}.`,
      );
    }
    if (requested && requested.config !== expected) {
      fail(
        `Project "${project.id}" must build with "${expected}", but ${requested.source} ` +
          `requested "${requested.config}". Fix the App Hosting environment name / env vars ` +
          `(apphosting.yaml sets APP_HOSTING_ENV=dev; prod needs apphosting.production.yaml).`,
      );
    }
    return { config: expected, reason: `project "${project.id}" (${project.source})` };
  }

  // 2. No project id (local build): explicit request, then NODE_ENV, then dev.
  if (requested) return { config: requested.config, reason: requested.source };
  if (process.env.NODE_ENV === 'production') return { config: 'production', reason: 'NODE_ENV=production' };
  return { config: 'dev', reason: 'default (no project id, no request)' };
}

const { config: targetConfig, reason } = resolveBuildConfig();
const command = `npx ng build --configuration ${targetConfig}`;

console.log(`\n======================================================`);
console.log(`🚀 [App Hosting Build] Target Environment: "${targetConfig}" — from ${reason}`);
console.log(`📦 Command: ${command}`);
console.log(`======================================================\n`);

try {
  execSync(command, { stdio: 'inherit' });
} catch (error) {
  console.error(`\x1b[31m[ERROR]\x1b[0m Build failed for configuration "${targetConfig}".`);
  process.exit(1);
}
