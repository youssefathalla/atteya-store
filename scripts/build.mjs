/**
 * Environment-Aware Angular Build Dispatcher for Firebase App Hosting
 *
 * Detects whether the current App Hosting backend or local runner is targeting
 * the 'dev' (atteya-store-dev) or 'prod' (attiya-store) environment, and
 * executes `ng build` with the corresponding configuration.
 */

import { execSync } from 'node:child_process';

function resolveBuildConfig() {
  // 1. Explicit CLI argument: `node scripts/build.mjs prod` or `node scripts/build.mjs dev`
  const arg = process.argv[2]?.toLowerCase();
  if (arg === 'prod' || arg === 'production') return 'production';
  if (arg === 'dev' || arg === 'development') return 'dev';

  // 2. App Hosting Environment Variable (from apphosting.yaml or Firebase Console)
  const appHostingEnv = process.env.APP_HOSTING_ENV?.toLowerCase();
  if (appHostingEnv === 'prod' || appHostingEnv === 'production') return 'production';
  if (appHostingEnv === 'dev' || appHostingEnv === 'development') return 'dev';

  // 3. Built-in Google Cloud / Firebase project identification
  const gcloudProject = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG;
  if (gcloudProject) {
    if (gcloudProject.includes('attiya-store') && !gcloudProject.includes('-dev')) {
      return 'production';
    }
    if (gcloudProject.includes('dev')) {
      return 'dev';
    }
  }

  // 4. NODE_ENV check
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }

  // 5. Default fallback to dev to prevent accidental production collisions
  return 'dev';
}

const targetConfig = resolveBuildConfig();
const command = `npx ng build --configuration ${targetConfig}`;

console.log(`\n======================================================`);
console.log(`🚀 [App Hosting Build] Target Environment: "${targetConfig}"`);
console.log(`📦 Command: ${command}`);
console.log(`======================================================\n`);

try {
  execSync(command, { stdio: 'inherit' });
} catch (error) {
  console.error(`\x1b[31m[ERROR]\x1b[0m Build failed for configuration "${targetConfig}".`);
  process.exit(1);
}
