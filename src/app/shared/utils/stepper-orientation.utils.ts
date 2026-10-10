import { computed, Signal } from '@angular/core';
import { StepperOrientation } from '@angular/material/stepper';
import { useBreakpoint } from './breakpoint.utils';

/**
 * Returns a signal that emits `'horizontal'` or `'vertical'` based on viewport size.
 * Must be called in an injection context.
 *
 * @param breakpoint - The min-width breakpoint (pixel number or media query string). Defaults to `800`.
 */
export function useStepperOrientation(
  breakpoint: number | string = 800,
): Signal<StepperOrientation> {
  const isWide = useBreakpoint(breakpoint, true);
  return computed<StepperOrientation>(() => (isWide() ? 'horizontal' : 'vertical'));
}
