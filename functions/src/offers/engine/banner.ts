import type { OfferBanner, OfferBannerCountdown } from './types.js';

/** Longest banner text staff can type (the bar is one line on a phone). */
export const MAX_BANNER_TEXT = 60;
/** "Only in the last N days": N is 1 to 30, 7 when not set. */
export const MIN_BANNER_COUNTDOWN_DAYS = 1;
export const MAX_BANNER_COUNTDOWN_DAYS = 30;
export const DEFAULT_BANNER_COUNTDOWN_DAYS = 7;

/** An offer saved before the top banner existed: not in the banner. */
export const DEFAULT_OFFER_BANNER: OfferBanner = {
  show: false,
  text: null,
  countdown: 'hide',
  countdownDays: DEFAULT_BANNER_COUNTDOWN_DAYS,
};

const COUNTDOWNS: readonly OfferBannerCountdown[] = ['hide', 'always', 'lastDays'];

/**
 * The offer's top banner settings from a stored value. Anything missing or wrong falls back to
 * `DEFAULT_OFFER_BANNER`, so an old offer (no `banner` field) is simply not in the banner.
 */
export function parseOfferBanner(raw: unknown): OfferBanner {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_OFFER_BANNER;
  const obj = raw as Record<string, unknown>;
  const text = typeof obj['text'] === 'string' ? obj['text'].trim().slice(0, MAX_BANNER_TEXT) : '';
  const countdown = COUNTDOWNS.includes(obj['countdown'] as OfferBannerCountdown)
    ? (obj['countdown'] as OfferBannerCountdown)
    : 'hide';
  return {
    show: obj['show'] === true,
    text: text.length > 0 ? text : null,
    countdown,
    countdownDays: clampBannerCountdownDays(obj['countdownDays']),
  };
}

/** A whole number of days from 1 to 30; anything else is the default 7. */
export function clampBannerCountdownDays(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_BANNER_COUNTDOWN_DAYS;
  return Math.max(MIN_BANNER_COUNTDOWN_DAYS, Math.min(MAX_BANNER_COUNTDOWN_DAYS, Math.round(raw)));
}
