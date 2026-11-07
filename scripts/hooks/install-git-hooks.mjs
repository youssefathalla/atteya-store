/**
 * `npm ci` / `npm install` run this through the `prepare` script. It points git at
 * `scripts/git-hooks/` (core.hooksPath) so the pre-push hook runs on every `git push`.
 * Skipped on CI and outside a git checkout. Never fails the install.
 */
import { execFileSync } from 'node:child_process';

if (process.env.CI || process.env.GITHUB_ACTIONS) process.exit(0);
try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  const current = execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (current === 'scripts/git-hooks') process.exit(0);
} catch {
  // Not a git checkout, or core.hooksPath not set yet: fall through.
}
try {
  execFileSync('git', ['config', 'core.hooksPath', 'scripts/git-hooks'], { stdio: 'ignore' });
  console.log('Git hooks: core.hooksPath set to scripts/git-hooks (pre-push checks on).');
} catch {
  // Not a git checkout (for example an npm pack): nothing to install.
}
