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
