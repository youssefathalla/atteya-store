import { inject, Injector, runInInjectionContext } from '@angular/core';

/**
 * Executes a function within the provided injection context.
 * Useful for calling injection-dependent APIs inside async callbacks.
 * @param fn The function to execute
 */
export function runInContext() {
  const injector = inject(Injector);
  return <T>(fn: () => T) => runInInjectionContext(injector, fn);
}
