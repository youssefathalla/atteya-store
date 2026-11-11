// GENERATED — edit functions/src/offers/engine
import type { Offer, OfferBundleRow, OfferReward } from './types';

/** A Bundle price offer has 1 to 10 rows. */
export const MAX_BUNDLE_ROWS = 10;
/** Each row is for 1 to 20 pieces (a bag line holds at most 20). */
export const MAX_BUNDLE_PIECES = 20;

/** One row of a bundle the bag used, e.g. `3 for 275` used once. */
export interface BundleRowUse extends OfferBundleRow {
  /** How many times the row is used (rows repeat: 6 pieces = two 3-rows). */
  readonly count: number;
}

/** The cheapest way to pay for some pieces with a bundle's rows. */
export interface BundleCover {
  /** Whole EGP for all the pieces. */
  readonly total: number;
  /** The rows used, biggest first. */
  readonly rows: readonly BundleRowUse[];
}

/**
 * The rows of a Bundle price reward that can be used: whole pieces 1–20 and whole EGP above 0,
 * one row per number of pieces (the first one wins), sorted by pieces, at most 10. Empty for any
 * other reward.
 */
export function bundleRows(reward: OfferReward): OfferBundleRow[] {
  if (reward.kind !== 'bundlePrice') return [];
  const rows: OfferBundleRow[] = [];
  for (const row of reward.rows) {
    if (rows.length >= MAX_BUNDLE_ROWS) break;
    const quantity = Number(row.quantity);
    const price = Number(row.price);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_BUNDLE_PIECES) continue;
    if (!Number.isInteger(price) || price < 1) continue;
    if (rows.some((other) => other.quantity === quantity)) continue;
    rows.push({ quantity, price });
  }
  return rows.sort((a, b) => a.quantity - b.quantity);
}

/** The price of the 1-piece row, or null when the offer has none. */
export function bundleOneRowPrice(offer: Pick<Offer, 'reward'>): number | null {
  return bundleRows(offer.reward).find((row) => row.quantity === 1)?.price ?? null;
}

/**
 * The cheapest way to pay for exactly `pieces` pieces with the rows (each row can be used any
 * number of times), or null when no mix of rows adds up to that many pieces. Fewer rows win a tie.
 */
export function bundleCover(rows: readonly OfferBundleRow[], pieces: number): BundleCover | null {
  const n = Math.max(0, Math.floor(pieces));
  if (n === 0) return { total: 0, rows: [] };
  // best[k] = cheapest total for k pieces; last[k] = the row used last to get there.
  const best: number[] = [0];
  const count: number[] = [0];
  const last: (OfferBundleRow | null)[] = [null];
  for (let k = 1; k <= n; k++) {
    best[k] = Number.POSITIVE_INFINITY;
    count[k] = Number.POSITIVE_INFINITY;
    last[k] = null;
    for (const row of rows) {
      if (row.quantity > k) continue;
      const total = best[k - row.quantity]! + row.price;
      const used = count[k - row.quantity]! + 1;
      if (total < best[k]! || (total === best[k]! && used < count[k]!)) {
        best[k] = total;
        count[k] = used;
        last[k] = row;
      }
    }
  }
  if (!Number.isFinite(best[n]!)) return null;
  const uses = new Map<number, BundleRowUse>();
  for (let k = n; k > 0;) {
    const row = last[k]!;
    const seen = uses.get(row.quantity);
    uses.set(row.quantity, { ...row, count: (seen?.count ?? 0) + 1 });
    k -= row.quantity;
  }
  return {
    total: best[n]!,
    rows: [...uses.values()].sort((a, b) => b.quantity - a.quantity),
  };
}

/**
 * How many of the pieces go into bundles, and what they cost: the pieces are given most expensive
 * first (`prices`, each piece's price without the bundle, after per-item offers); the first `pieces`
 * of them pay the bundle total, the rest their own price. The cheapest for the shopper wins; a tie
 * keeps fewer pieces in the bundle (their own offers), so the bundle never costs the shopper more.
 */
export function bestBundle(
  rows: readonly OfferBundleRow[],
  prices: readonly number[],
): { readonly pieces: number; readonly cover: BundleCover } {
  let pieces = 0;
  let cover: BundleCover = { total: 0, rows: [] };
  let best = prices.reduce((sum, price) => sum + price, 0);
  let rest = best;
  for (let k = 1; k <= prices.length; k++) {
    rest -= prices[k - 1]!;
    const candidate = bundleCover(rows, k);
    if (!candidate) continue;
    if (candidate.total + rest < best) {
      best = candidate.total + rest;
      pieces = k;
      cover = candidate;
    }
  }
  return { pieces, cover };
}

/**
 * Splits a bundle total over its pieces by their own prices, in whole EGP that add up exactly:
 * the leftover pounds go to the first pieces (275 for three pieces of 175 = 92 + 92 + 91).
 */
export function splitBundleTotal(total: number, prices: readonly number[]): number[] {
  if (prices.length === 0) return [];
  const weights = prices.map((price) => Math.max(0, Math.round(price)));
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const shares =
    sum > 0
      ? weights.map((weight) => Math.floor((total * weight) / sum))
      : weights.map(() => Math.floor(total / weights.length));
  let left = total - shares.reduce((acc, share) => acc + share, 0);
  for (let index = 0; left > 0; index = (index + 1) % shares.length, left--) shares[index]! += 1;
  return shares;
}

/** "2 for EGP 200" with the amount written by `money` (whole EGP in, text out). */
export function bundleRowText(
  row: OfferBundleRow,
  money: (egp: number) => string = (egp) => `EGP ${egp.toLocaleString('en-US')}`,
): string {
  return `${row.quantity} for ${money(row.price)}`;
}

/** Every row of an offer: "2 for EGP 200 · 3 for EGP 275". */
export function bundleRowsText(rows: readonly OfferBundleRow[], money?: (egp: number) => string): string {
  return rows.map((row) => bundleRowText(row, money)).join(' · ');
}

/** The rows a bundle used: "3 for EGP 275 + 1 for EGP 125", a repeated row as "2 × 3 for EGP 275". */
export function bundleUseText(rows: readonly BundleRowUse[], money?: (egp: number) => string): string {
  return rows
    .map((row) => (row.count > 1 ? `${row.count} × ${bundleRowText(row, money)}` : bundleRowText(row, money)))
    .join(' + ');
}
