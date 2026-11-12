import * as v from 'valibot';

/**
 * Shop by player (ATS-79). `settings/players` holds `players: [{ id, name }]`
 * (public read, admin write). Products keep the chosen ids in `players`.
 * Keep the limits in step with `functions/src/products/players.ts`.
 */
export const PLAYERS_DOC = ['settings', 'players'] as const;
export const MAX_PRODUCT_PLAYERS = 10;
export const MAX_PLAYERS = 100;
export const MAX_PLAYER_NAME = 60;
export const MAX_PLAYER_ID = 60;

/** Lowercase letters and digits in parts joined by single dashes ("ale-galan"). */
function isPlayerIdText(value: string): boolean {
  if (value.length === 0 || value.length > MAX_PLAYER_ID) return false;
  return value.split('-').every((part) => part.length > 0 && isAlphanumeric(part));
}

function isAlphanumeric(part: string): boolean {
  for (const char of part) {
    const code = char.charCodeAt(0);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 122))) return false;
  }
  return true;
}

export const PlayerIdSchema = v.pipe(
  v.string(),
  v.check(isPlayerIdText, 'Use lowercase letters, numbers and dashes.'),
);

export const PlayerSchema = v.object({
  id: PlayerIdSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_PLAYER_NAME)),
});

export type Player = v.InferOutput<typeof PlayerSchema>;

/** Valid entries of a `settings/players` doc. Bad or repeated entries are skipped, never the whole list. */
export function parsePlayerList(raw: unknown): Player[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const list = (raw as { players?: unknown }).players;
  if (!Array.isArray(list)) return [];
  const players: Player[] = [];
  for (const entry of list) {
    const parsed = v.safeParse(PlayerSchema, entry);
    if (!parsed.success || players.some((player) => player.id === parsed.output.id)) continue;
    players.push(parsed.output);
  }
  return players;
}

/** Link name for a new player: accent-free lowercase words joined by dashes ("Ale Galán" -> "ale-galan"). */
export function playerIdFromName(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
  let id = words.join('-').slice(0, MAX_PLAYER_ID);
  while (id.endsWith('-')) id = id.slice(0, -1);
  return id;
}

export function isPlayerId(value: string): boolean {
  return isPlayerIdText(value);
}
