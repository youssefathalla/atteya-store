import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when this file was invoked directly (node scripts/foo.mjs). */
export function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  const scriptPath = path.resolve(fileURLToPath(metaUrl));
  const invokedPath = path.resolve(process.argv[1]);
  if (process.platform === 'win32') {
    return scriptPath.toLowerCase() === invokedPath.toLowerCase();
  }
  return scriptPath === invokedPath;
}
