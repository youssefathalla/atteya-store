import * as v from 'valibot';
import { timestampToMs } from '@core/services/products/utils/new-arrival';

/** Settings docs with Previous Versions (ATS-251); keep equal to `SETTINGS_HISTORY_DOCS` in functions. */
export type SettingsHistoryDocId = 'navigation' | 'home';

/** Newest versions the trigger keeps per doc (`MAX_SETTINGS_VERSIONS` in functions). */
export const SETTINGS_VERSIONS_LIMIT = 30;

/** `settingsHistory/{docId}/versions/{id}`, written only by the `onSettingsHistoryWrite` trigger. */
export const SettingsVersionDocSchema = v.object({
  data: v.unknown(),
  savedAt: v.unknown(),
  replacedAt: v.unknown(),
  savedBy: v.fallback(v.nullable(v.string()), null),
  savedByEmail: v.fallback(v.nullable(v.string()), null),
  summary: v.fallback(v.string(), ''),
});

/** One earlier version as the Previous Versions dialog lists it. */
export interface SettingsVersion {
  readonly id: string;
  /** When that version was saved (its `updatedAt`), else when it was replaced. */
  readonly savedAtMs: number;
  /** Email of the person who saved it, else null. */
  readonly savedByEmail: string | null;
  readonly summary: string;
  /** The saved doc as it was, still unchecked: each page parses it with its own schema. */
  readonly data: unknown;
}

/** A version doc as `SettingsVersion`, or null when the envelope itself is broken. */
export function settingsVersionFrom(id: string, raw: unknown): SettingsVersion | null {
  const parsed = v.safeParse(SettingsVersionDocSchema, raw);
  if (!parsed.success) return null;
  const doc = parsed.output;
  const savedAtMs = timestampToMs(doc.savedAt) ?? timestampToMs(doc.replacedAt);
  if (savedAtMs === null) return null;
  return {
    id,
    savedAtMs,
    savedByEmail: doc.savedByEmail,
    summary: doc.summary,
    data: doc.data,
  };
}

const CAIRO_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "12 Nov, 14:07" in Cairo time. */
export function cairoDateTime(ms: number): string {
  const parts = CAIRO_DATE_TIME.formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`;
}

/** The note shown after a version is loaded into the editor. */
export function restoredVersionNote(savedAtMs: number): string {
  return `Restored the version from ${cairoDateTime(savedAtMs)}. Review it, then Publish to Store.`;
}
