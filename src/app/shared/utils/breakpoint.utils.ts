import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';

/**
 * Returns a reactive boolean signal indicating whether the media query matches.
 * Must be called in an injection context (e.g. component field initializer or constructor).
 *
 * @param breakpoint - The min-width breakpoint.
 *   - If `number`: treated as pixels (e.g. `1280` -> `'(min-width: 1280px)'`).
 *   - If `string`: treated as a raw CSS media query (e.g. `'(min-width: 1280px)'`).
 *   Defaults to `1024`.
 * @param initialValue - Fallback value before the first browser match evaluation (default `true`).
 */
export function useBreakpoint(
  breakpoint: number | string = 1024,
  initialValue = true,
): Signal<boolean> {
  const breakpointObserver = inject(BreakpointObserver);
  const query = typeof breakpoint === 'number' ? `(min-width: ${breakpoint}px)` : breakpoint;

  return toSignal(
    breakpointObserver.observe(query).pipe(map(({ matches }) => matches)),
    { initialValue },
  );
}
