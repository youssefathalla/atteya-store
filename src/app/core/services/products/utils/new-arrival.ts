/** Homepage New Arrivals row pool size (3 visible + peek; scroll for the rest). */
export const NEW_ARRIVALS_LIMIT = 10;

/** Default window when an admin ticks "New arrival". */
export const NEW_ARRIVAL_DEFAULT_MONTHS = 2;

/** Over-fetch flagged docs so we can pick the 10 most recently updated client-side. */
export const NEW_ARRIVAL_FLAGGED_FETCH = 40;

export function addMonths(from: Date, months: number): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function defaultNewArrivalUntil(from: Date = new Date()): Date {
  return addMonths(from, NEW_ARRIVAL_DEFAULT_MONTHS);
}

/** Calendar YYYY-MM-DD for `<input type="date">` (local). */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as local midnight; invalid → null. */
export function parseDateInputValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function timestampToMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const ms = toMillis.call(value);
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    }
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function isActiveNewArrival(
  until: unknown,
  nowMs: number = Date.now(),
): boolean {
  const untilMs = timestampToMs(until);
  return untilMs !== null && untilMs > nowMs;
}

/** Whole days remaining, rounded up. Null when not active. */
export function newArrivalDaysLeft(
  until: unknown,
  nowMs: number = Date.now(),
): number | null {
  const untilMs = timestampToMs(until);
  if (untilMs === null || untilMs <= nowMs) return null;
  return Math.max(1, Math.ceil((untilMs - nowMs) / 86_400_000));
}

export function newArrivalCountdownLabel(
  until: unknown,
  nowMs: number = Date.now(),
): string | null {
  const days = newArrivalDaysLeft(until, nowMs);
  if (days === null) return null;
  return days === 1 ? '1 day left' : `${days} days left`;
}

/**
 * Flagged (already filtered to unexpired) first by most recent `updatedAt`,
 * then newest by `createdAt`, de-duped, capped.
 */
export function mergeNewArrivalPool<T extends { readonly id: string }>(
  flagged: readonly T[],
  newest: readonly T[],
  updatedAtMs: (item: T) => number,
  limit: number = NEW_ARRIVALS_LIMIT,
): readonly T[] {
  const rankedFlagged = [...flagged].sort(
    (a, b) => updatedAtMs(b) - updatedAtMs(a),
  );
  const selected = rankedFlagged.slice(0, limit);
  if (selected.length >= limit) return selected;

  const seen = new Set(selected.map((item) => item.id));
  const out = [...selected];
  for (const item of newest) {
    if (seen.has(item.id)) continue;
    out.push(item);
    seen.add(item.id);
    if (out.length >= limit) break;
  }
  return out;
}
