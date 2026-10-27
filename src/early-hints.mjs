/**
 * SSR and prerender HTML already paints from inlined CSS.
 * modulepreload and font preload links are fetched at high priority during
 * HTML parse, so on a fast connection they finish before first paint.
 * Lighthouse then simulates that whole download on Slow 4G and reports it as FCP.
 * The empty client shell (login, admin) keeps its script preloads: it has no
 * server HTML to paint. Fonts still load from CSS (swap for text, block for icons).
 */

const CLIENT_SHELL = /<app-root>\s*<\/app-root>/;

/** @param {string} html */
export function trimRenderedEarlyHints(html) {
  if (CLIENT_SHELL.test(html)) return html;
  return html
    .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/gi, '')
    .replace(/<link\b[^>]*\brel="preload"[^>]*\bas="font"[^>]*>\s*/gi, '')
    .replace(/<link\b[^>]*\bas="font"[^>]*\brel="preload"[^>]*>\s*/gi, '');
}
