/**
 * True for the browser's "this page's code couldn't be downloaded" errors (offline, or an old tab after
 * a new release): Chrome, Firefox and Safari word them differently; Angular wraps them unchanged.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.name} ${error.message}` : typeof error === 'string' ? error : '';
  if (!message) return false;
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('ChunkLoadError') ||
    message.includes('Loading chunk')
  );
}

/** `sessionStorage` key of the last automatic reload for missing page code. */
export const MISSING_CODE_RELOAD_KEY = 'atteya-missing-code-reload';

/** A second failure within this time shows Something Went Wrong instead of reloading again. */
export const MISSING_CODE_RELOAD_WINDOW_MS = 30_000;

/**
 * Whether a page whose code couldn't be downloaded should reload the site once instead of showing an
 * error. An open tab from before a release asks for code files the new release no longer has; a
 * reload picks up the new files. Not while offline (a reload can't help then), and not again within
 * {@link MISSING_CODE_RELOAD_WINDOW_MS} of the last reload, so a file that is really missing never
 * reloads in a loop. `lastReload` is the saved `Date.now()` of that reload, or null.
 */
export function shouldReloadForMissingCode(lastReload: string | null, online: boolean, now: number): boolean {
  if (!online) return false;
  const last = lastReload === null ? Number.NaN : Number(lastReload);
  return !Number.isFinite(last) || now - last < 0 || now - last >= MISSING_CODE_RELOAD_WINDOW_MS;
}
