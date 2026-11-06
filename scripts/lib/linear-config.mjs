/**
 * Reads `linear.config.json` (repo root): the Linear team key that issue ids start with (`ATS-123`).
 * The branch-name hook, the docs check and `.github/workflows/pr-title.yml` all use it,
 * so a Linear team key change is a one-line edit there.
 */
import { readFileSync } from 'node:fs';

export const LINEAR_CONFIG_URL = new URL('../../linear.config.json', import.meta.url);

/** A Linear team key: an uppercase letter, then uppercase letters or digits (Linear allows up to 7 characters). */
const TEAM_KEY = /^[A-Z][A-Z0-9]{0,6}$/;

/**
 * The parsed config. Throws with a readable message when the file is missing or a key is malformed.
 * @returns {{ workspace: string; team: string; teamKey: string; previousTeamKeys: string[]; project: string }}
 */
export function readLinearConfig() {
  const config = JSON.parse(readFileSync(LINEAR_CONFIG_URL, 'utf8'));
  const previousTeamKeys = config.previousTeamKeys ?? [];
  if (!TEAM_KEY.test(config.teamKey ?? '')) {
    throw new Error(`linear.config.json: teamKey "${config.teamKey}" must be 1-7 uppercase letters or digits, starting with a letter`);
  }
  if (!Array.isArray(previousTeamKeys) || !previousTeamKeys.every((key) => TEAM_KEY.test(key))) {
    throw new Error('linear.config.json: previousTeamKeys must be a list of uppercase team keys');
  }
  if (previousTeamKeys.includes(config.teamKey)) {
    throw new Error(`linear.config.json: teamKey "${config.teamKey}" is also listed in previousTeamKeys`);
  }
  return { ...config, previousTeamKeys };
}

/** Every team key, current first, or `[]` when the config can't be read (so a hook never blocks every command). */
export function allTeamKeysOrEmpty() {
  try {
    const { teamKey, previousTeamKeys } = readLinearConfig();
    return [teamKey, ...previousTeamKeys];
  } catch {
    return [];
  }
}
