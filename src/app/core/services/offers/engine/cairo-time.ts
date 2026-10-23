// GENERATED — edit functions/src/offers/engine
export const CAIRO_TIMEZONE = 'Africa/Cairo';

export interface CairoWallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const CAIRO_PARTS_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAIRO_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const CAIRO_DISPLAY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAIRO_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Converts a wall-clock date/time in Africa/Cairo into an exact UTC Date,
 * dynamically accounting for Egypt DST (+02:00 / +03:00).
 */
export function cairoWallTimeToDate(wall: CairoWallTime): Date {
  const targetUtcLikeMs = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );

  // Two-pass refinement handles DST transitions accurately.
  let guessMs = targetUtcLikeMs - 2 * 3600_000;
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = dateToCairoWallTime(new Date(guessMs));
    const actualUtcLikeMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guessMs += targetUtcLikeMs - actualUtcLikeMs;
  }

  return new Date(guessMs);
}

/**
 * Parses an HTML `datetime-local` or `YYYY-MM-DD` string in Africa/Cairo time.
 * When `endOfDayIfDateOnly` is true, a date-only string resolves to 23:59:59.
 */
export function parseCairoDateTimeInput(
  raw: string,
  endOfDayIfDateOnly = false,
): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hasTime = match[4] !== undefined && match[5] !== undefined;

  const hour = hasTime ? Number.parseInt(match[4], 10) : endOfDayIfDateOnly ? 23 : 0;
  const minute = hasTime ? Number.parseInt(match[5], 10) : endOfDayIfDateOnly ? 59 : 0;
  const second =
    match[6] !== undefined
      ? Number.parseInt(match[6], 10)
      : endOfDayIfDateOnly && !hasTime
        ? 59
        : 0;

  return cairoWallTimeToDate({ year, month, day, hour, minute, second });
}

export function dateToCairoWallTime(date: Date): CairoWallTime {
  const parts = CAIRO_PARTS_FORMATTER.formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    const num = Number.parseInt(part.value, 10);
    if (!Number.isFinite(num)) continue;
    if (part.type === 'year') year = num;
    else if (part.type === 'month') month = num;
    else if (part.type === 'day') day = num;
    else if (part.type === 'hour') hour = num === 24 ? 0 : num;
    else if (part.type === 'minute') minute = num;
    else if (part.type === 'second') second = num;
  }

  return { year, month, day, hour, minute, second };
}

export function formatCairoDateTimeInput(date: Date | null): string {
  if (!date) return '';
  const w = dateToCairoWallTime(date);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

export function formatCairoDisplay(date: Date | null): string {
  if (!date) return '';
  return CAIRO_DISPLAY_FORMATTER.format(date);
}
