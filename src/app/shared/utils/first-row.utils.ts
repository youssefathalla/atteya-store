import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

/** Cards per row of a product grid: `base` on phones, `md` from 768px, `lg` from 1024px (Tailwind breakpoints). */
export interface GridColumns {
  readonly base: number;
  readonly md?: number;
  readonly lg?: number;
}

/**
 * How many cards fill the first row of a product grid, so exactly that row gets `priority` photos.
 *
 * - Server: always `base` (the phone row). The server can't see the screen, and every `priority`
 *   photo becomes a `<link rel="preload">` in the HTML, so a phone never preloads a wider row.
 * - Browser: the row at the screen width when the grid is created. Read once and never updated,
 *   because `NgOptimizedImage` does not allow `priority` to change after the photo is set up.
 *
 * On a wider screen the extra first-row photos are switched to eager loading with high fetch
 * priority when the page hydrates (an attribute change only, so no hydration mismatch).
 * Must be called in an injection context (a field initializer or constructor).
 */
export function injectFirstRowCount(columns: GridColumns): number {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return columns.base;
  const view = inject(DOCUMENT).defaultView;
  if (!view?.matchMedia) return columns.base;
  if (columns.lg !== undefined && view.matchMedia('(min-width: 1024px)').matches) {
    return columns.lg;
  }
  if (columns.md !== undefined && view.matchMedia('(min-width: 768px)').matches) {
    return columns.md;
  }
  return columns.base;
}
