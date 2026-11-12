/** The quick choices in the Date menu. */
export type OrderDatePreset = 'today' | 'yesterday' | 'last7' | 'month';

/** Orders placed from the start of `from` to the end of `to` (whole days, the admin's own time). */
export interface OrderDateFilter {
  readonly from: Date;
  readonly to: Date;
  /** Set when picked from the menu's quick choices; null for a day or range picked on the calendar. */
  readonly preset: OrderDatePreset | null;
}

export const ORDER_DATE_PRESETS: readonly { readonly id: OrderDatePreset; readonly label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
];

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The days a quick choice covers on `now`'s date. */
export function presetFilter(preset: OrderDatePreset, now: Date): OrderDateFilter {
  const today = startOfDay(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today, preset };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday, preset };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today, preset };
    case 'month':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today, preset };
  }
}

/** A day or range picked on the calendar; the days are put in order and a missing end = one day. */
export function pickedFilter(start: Date, end: Date | null): OrderDateFilter {
  const from = startOfDay(start);
  const to = startOfDay(end ?? start);
  return from <= to ? { from, to, preset: null } : { from: to, to: from, preset: null };
}

/** The Firestore bounds on `createdAt`: from midnight of `from` up to (not including) the next midnight after `to`. */
export function createdAtBounds(filter: OrderDateFilter): { readonly start: Date; readonly end: Date } {
  return { start: startOfDay(filter.from), end: addDays(filter.to, 1) };
}

/** "Sun 8 Nov", with the year when it isn't this year ("Sun 8 Nov 2025"). */
export function formatOrderDay(date: Date, now: Date): string {
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** "Sun 8 Nov" for one day, "Sun 8 Nov – Tue 10 Nov" for a range (the chip). */
export function orderDateRangeLabel(filter: OrderDateFilter, now: Date): string {
  const from = formatOrderDay(filter.from, now);
  if (filter.from.getTime() === filter.to.getTime()) return from;
  return `${from} – ${formatOrderDay(filter.to, now)}`;
}

/** What the Date field shows: "Any Date", a quick choice's name, or the days picked. */
export function orderDateFieldLabel(filter: OrderDateFilter | null, now: Date): string {
  if (!filter) return 'Any Date';
  const preset = ORDER_DATE_PRESETS.find((item) => item.id === filter.preset);
  return preset ? preset.label : orderDateRangeLabel(filter, now);
}

/** The grey hint beside each quick choice in the menu ("Thu 12 Nov", "6 – 12 Nov", "November"). */
export function presetHint(preset: OrderDatePreset, now: Date): string {
  const filter = presetFilter(preset, now);
  if (preset === 'month') return new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(filter.from);
  if (filter.from.getTime() === filter.to.getTime()) return formatOrderDay(filter.from, now);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
  const sameMonth = filter.from.getMonth() === filter.to.getMonth();
  const fromText = sameMonth
    ? day.format(filter.from)
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(filter.from);
  return `${fromText} – ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(filter.to)}`;
}
