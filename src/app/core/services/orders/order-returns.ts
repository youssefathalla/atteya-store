import {
  piecesLeft,
  readReturnOrderLines,
  readReturnSummaries,
  returnEligibility,
  RETURN_WINDOW_DAYS,
  type ReturnEligibility,
  timestampMs,
  type ReturnOrderFacts,
} from '@core/config/returns';
import type { OrderDoc } from './order.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** The order as the shared returns rules read it (`returnEligibility()`). */
export function returnOrderFacts(order: OrderDoc): ReturnOrderFacts {
  const raw = 'deliveredAt' in order ? order.deliveredAt : null;
  const parsed = typeof raw === 'string' ? Date.parse(raw) : timestampMs(raw);
  return {
    status: order.status,
    deliveredAtMs: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    isInternational: order.pricing.isInternational,
    returns: readReturnSummaries(order.returns),
  };
}

/**
 * What the order page and Account → Orders show about returns:
 * `open` = the **Return or Exchange** button (until `until`), `closed` = the 14 days are over
 * ("Returns closed on 27 Nov."), `none` = nothing (not delivered, abroad, a request in progress, or
 * every piece already requested).
 */
export type ReturnEntry =
  | { readonly kind: 'open'; readonly until: string; readonly closesAtMs: number }
  | { readonly kind: 'closed'; readonly closedOn: string }
  | { readonly kind: 'none' };

export function returnEntry(order: OrderDoc, nowMs: number): ReturnEntry {
  const facts = returnOrderFacts(order);
  const eligibility: ReturnEligibility = returnEligibility(facts, nowMs);
  if (eligibility.ok) {
    // Every piece is already in a request: nothing left to pick.
    const left = piecesLeft(readReturnOrderLines(order.pricing.lines), facts.returns);
    if (!left.some((pieces) => pieces > 0)) return { kind: 'none' };
    return { kind: 'open', until: shortDay(eligibility.closesAtMs), closesAtMs: eligibility.closesAtMs };
  }
  if (eligibility.reason === 'window-closed' && facts.deliveredAtMs !== null) {
    return { kind: 'closed', closedOn: shortDay(facts.deliveredAtMs + RETURN_WINDOW_DAYS * DAY_MS) };
  }
  return { kind: 'none' };
}

/** "24 Nov". */
export function shortDay(ms: number): string {
  return SHORT_DAY.format(new Date(ms));
}
