import type { ActivatedRouteSnapshot, Data } from '@angular/router';

/**
 * How much store chrome `MainLayoutComponent` shows around a page.
 * - `store`: shipping banner, navigation, footer and the mobile bottom bar (default).
 * - `focus`: only a slim bar with the logo, for single-task pages (Sign in, Checkout).
 */
export type ChromeMode = 'store' | 'focus';

/** Route `data` for a single-task page: `{ path: 'checkout', data: FOCUS_CHROME }`. */
export const FOCUS_CHROME: Data = { chrome: 'focus' satisfies ChromeMode };

/** Chrome for the deepest active route (child routes win over parents). */
export function chromeModeOf(root: ActivatedRouteSnapshot): ChromeMode {
  let route = root;
  while (route.firstChild) route = route.firstChild;
  return route.data['chrome'] === 'focus' ? 'focus' : 'store';
}
