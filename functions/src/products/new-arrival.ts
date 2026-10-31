/** Keep in sync with `src/app/core/services/products/utils/new-arrival.ts`. */

export const NEW_ARRIVAL_DEFAULT_MONTHS = 2;

export function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function defaultNewArrivalUntil(from: Date = new Date()): Date {
  return addMonths(from, NEW_ARRIVAL_DEFAULT_MONTHS);
}
