/** `RESPONSE_INIT` on the server; null in the browser. */
type ResponseInitLike = { status?: number; headers?: HeadersInit } | null;

/** Server answer for a page that doesn't exist: 404 and never cached. */
export function markNotFound(responseInit: ResponseInitLike): void {
  setStatus(responseInit, 404);
}

function setStatus(responseInit: ResponseInitLike, status: number): void {
  if (!responseInit) return;
  responseInit.status = status;
  const headers = new Headers(responseInit.headers);
  headers.set('Cache-Control', 'private, no-store');
  responseInit.headers = headers;
}
