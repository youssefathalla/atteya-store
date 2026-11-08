/**
 * Shop by player (ATS-79): the admin-managed player list lives in `settings/players`
 * (`players: [{ id, name }]`, public read, admin write through the existing settings rule).
 * Products keep the chosen ids in `players`. Angular copy of the shape:
 * `src/app/core/services/products/player.schema.ts`.
 */

export const PLAYERS_DOC_PATH = 'settings/players';
/** Most players one product can carry. */
export const MAX_PRODUCT_PLAYERS = 10;
/** Most players the list can hold. */
export const MAX_PLAYERS = 100;
export const MAX_PLAYER_NAME = 60;
export const MAX_PLAYER_ID = 60;

export interface PlayerEntry {
  readonly id: string;
  readonly name: string;
}

/** Lowercase letters and digits in parts joined by single dashes ("ale-galan"). */
export function isPlayerId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PLAYER_ID) return false;
  return value.split('-').every((part) => part.length > 0 && isAlphanumeric(part));
}

function isAlphanumeric(part: string): boolean {
  for (const char of part) {
    const code = char.charCodeAt(0);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 122))) return false;
  }
  return true;
}

/** Valid `{ id, name }` entries of a `settings/players` doc. Bad or repeated entries are skipped. */
export function readPlayerList(data: unknown): PlayerEntry[] {
  if (typeof data !== 'object' || data === null) return [];
  const raw = (data as { players?: unknown }).players;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: PlayerEntry[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const id = (entry as { id?: unknown }).id;
    const rawName = (entry as { name?: unknown }).name;
    if (!isPlayerId(id) || seen.has(id) || typeof rawName !== 'string') continue;
    const name = rawName.trim();
    if (name.length === 0 || name.length > MAX_PLAYER_NAME) continue;
    seen.add(id);
    list.push({ id, name });
  }
  return list;
}

/** A product's saved player ids: valid ids only, no repeats, at most MAX_PRODUCT_PLAYERS. */
export function readProductPlayerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const entry of raw) {
    if (!isPlayerId(entry) || ids.includes(entry)) continue;
    ids.push(entry);
    if (ids.length >= MAX_PRODUCT_PLAYERS) break;
  }
  return ids;
}
