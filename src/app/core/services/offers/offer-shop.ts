// Type-only imports: `npm run test:cart` loads this file straight from source.
import type { BagBundle, BagDealHint, Offer, OfferBundleRow, OfferConditions } from './engine';

/**
 * True when Shop can list this offer's products (`/shop?offer=<id>`): the search index keeps the
 * offer ids of public offers for everyone that need no code and have no per-customer limit (those
 * are for signed-in shoppers only, see `liveOffers`), so only those can be filtered on.
 */
export function canShopOffer(offer: Offer): boolean {
  return (
    offer.visibility === 'public' &&
    offer.audience === 'everyone' &&
    !offer.requiresCode &&
    offer.limits.perCustomer === null
  );
}

/**
 * Whether a shopper may be shown this offer's title (product page line, Shop heading). Free
 * shipping offers apply to Egypt orders only, so a visitor outside Egypt never sees one. An
 * unknown country counts as Egypt, like the bag's payment methods.
 */
export function offerTitleVisible(offer: Offer, visitorCountry: string | null): boolean {
  if (offer.reward.kind !== 'freeShipping') return true;
  return (visitorCountry ?? 'EG') === 'EG';
}

/** Query params of the offer's Shop page. */
export function offerShopQuery(offerId: string): { readonly offer: string } {
  return { offer: offerId };
}

/**
 * The line under the offer's Shop heading: which piece is free in a Buy X Get Y offer whose free
 * pieces come from the same items ("The cheapest one is free."), or a Bundle price offer's rows
 * ("2 for EGP 200 · 3 for EGP 275", amounts written by `money`). Null for every other offer.
 */
export function offerShopSubtitle(offer: Offer, money: (egp: number) => string = egpText): string | null {
  const reward = offer.reward;
  if (reward.kind === 'bundlePrice') {
    const rows = [...reward.rows].sort((a, b) => a.quantity - b.quantity);
    return rows.length > 0 ? rows.map((row) => bundleRowLabel(row, money)).join(' · ') : null;
  }
  if (reward.kind !== 'buyXGetY' || reward.getConditions !== null) return null;
  const many = reward.get.quantity > 1;
  const subject = many ? 'The cheapest ones are' : 'The cheapest one is';
  return reward.get.percent >= 100 ? `${subject} free.` : `${subject} ${reward.get.percent}% off.`;
}

/** "2 for EGP 200". */
export function bundleRowLabel(row: OfferBundleRow, money: (egp: number) => string = egpText): string {
  return `${row.quantity} for ${money(row.price)}`;
}

/**
 * The bag's grey strip for a bundle: "<title> · 2 for EGP 200" ("3 for EGP 275 + 1 for EGP 125"
 * for two rows, "2 × 3 for EGP 275" for a repeated row). Null while no piece is in the bundle.
 */
export function bundleStripTitle(bundle: BagBundle, money: (egp: number) => string = egpText): string | null {
  if (bundle.units === 0 || bundle.rows.length === 0) return null;
  const rows = bundle.rows
    .map((row) =>
      row.count > 1 ? `${row.count} × ${bundleRowLabel(row, money)}` : bundleRowLabel(row, money),
    )
    .join(' + ');
  return `${bundle.title} · ${rows}`;
}

/** The bag's bundle nudge: "Add 1 more to get 3 for EGP 275". Null at the top row. */
export function bundleNudgeText(bundle: BagBundle, money: (egp: number) => string = egpText): string | null {
  const next = bundle.next;
  if (!next) return null;
  return `Add ${next.missing} more to get ${bundleRowLabel(next, money)}`;
}

function egpText(egp: number): string {
  return `EGP ${egp.toLocaleString('en-US')}`;
}

/**
 * How the shopper completes a Buy X Get Y group from the bag:
 * - `add-same`: the offer covers one product, so **Add 2** adds more of the same item.
 * - `shop`: the offer covers more (a category, a brand, a list, the whole store), so **Shop the
 *   Offer** opens Shop filtered to it.
 * - `browse`: the offer covers more but Shop can't filter on it (signed-in only or with a code,
 *   see `canShopOffer`), so **Keep Shopping** opens Shop.
 */
export function dealHintAction(offer: Offer | undefined): 'add-same' | 'shop' | 'browse' {
  if (!offer || coversOneProduct(offer)) return 'add-same';
  return canShopOffer(offer) ? 'shop' : 'browse';
}

/**
 * The bag's nudge text. One product: "Add 2 more to get 1 free". One category: "Add 2 more from
 * T-shirts & polos to get 1 free". The whole store: "Add any 2 more items to get 1 free".
 * Anything else: "Add 2 more items to get 1 free". `categoryName` turns a category id into its
 * name; without one (or for an unknown id) the text says "items".
 */
export function dealHintText(
  hint: BagDealHint,
  offer?: Offer,
  categoryName: (id: string) => string | null = () => null,
): string {
  if (!hint.samePool) return `${hint.title}: add the free item to your bag.`;
  const reward = hint.percent >= 100 ? `${hint.free} free` : `${hint.free} at ${hint.percent}% off`;
  const items = hint.missing === 1 ? 'item' : 'items';
  if (dealHintAction(offer) === 'add-same') return `Add ${hint.missing} more to get ${reward}`;
  if (offer!.conditions.anyOf.length === 0) return `Add any ${hint.missing} more ${items} to get ${reward}`;
  const category = oneCategoryId(offer!);
  const name = category ? categoryName(category) : null;
  if (name) return `Add ${hint.missing} more from ${name} to get ${reward}`;
  return `Add ${hint.missing} more ${items} to get ${reward}`;
}

type ConditionAtom = OfferConditions['anyOf'][number]['allOf'][number];

/** The offer's conditions name exactly one product and nothing else. */
function coversOneProduct(offer: Offer): boolean {
  const atom = onlyAtom(offer);
  return (
    atom !== null &&
    atom.field === 'productId' &&
    (atom.in?.length ?? 0) === 1 &&
    (atom.notIn?.length ?? 0) === 0
  );
}

/** The one category the offer covers, when its conditions are only that. */
function oneCategoryId(offer: Offer): string | null {
  const atom = onlyAtom(offer);
  if (atom === null || atom.field !== 'categoryIds' || (atom.notIn?.length ?? 0) > 0) return null;
  return atom.in?.length === 1 ? (atom.in[0] ?? null) : null;
}

function onlyAtom(offer: Offer): ConditionAtom | null {
  const groups = offer.conditions.anyOf;
  if (groups.length !== 1 || groups[0]!.allOf.length !== 1) return null;
  return groups[0]!.allOf[0]!;
}

/** At most this many offers rotate in the top announcement bar. */
export const MAX_BANNER_OFFERS = 4;

/**
 * Offers shown in the top announcement bar, in order: staff turned the banner on, Shop can list
 * the offer (`canShopOffer`: public, for everyone, no code), it is running at `now` (on, not
 * archived, started, not ended), and the visitor may see its title (`offerTitleVisible`: no Free
 * shipping offer outside Egypt). Highest priority first, then the newest edit; at most 4.
 */
export function bannerOffers(
  offers: readonly Offer[],
  now: Date,
  visitorCountry: string | null,
): readonly Offer[] {
  const nowMs = now.getTime();
  return offers
    .filter(
      (offer) =>
        offer.banner?.show === true &&
        canShopOffer(offer) &&
        offerRunning(offer, nowMs) &&
        offerTitleVisible(offer, visitorCountry),
    )
    .sort((a, b) => b.priority - a.priority || (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))
    .slice(0, MAX_BANNER_OFFERS);
}

/** The banner text: what staff typed, or the offer's customer title. */
export function bannerText(offer: Offer): string {
  return offer.banner?.text?.trim() || offer.title;
}

const DAY_MS = 86_400_000;

/**
 * The countdown after the banner text, or null when it doesn't show: "Ends in 2d 14h 05m", or under
 * 24 hours "Ends in 05:12:33". "Only in the last N days" shows it once N days or less are left.
 */
export function bannerCountdown(offer: Offer, now: Date): string | null {
  const banner = offer.banner;
  const endsAt = offer.schedule.endsAt;
  if (!banner || banner.countdown === 'hide' || !endsAt) return null;
  const leftMs = endsAt.getTime() - now.getTime();
  if (leftMs <= 0) return null;
  if (banner.countdown === 'lastDays' && leftMs > banner.countdownDays * DAY_MS) return null;
  const totalSeconds = Math.floor(leftMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days === 0) return `Ends in ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `Ends in ${days}d ${hours}h ${pad(minutes)}m`;
}

function offerRunning(offer: Offer, nowMs: number): boolean {
  if (!offer.active || offer.archived) return false;
  if (offer.schedule.startsAt && nowMs < offer.schedule.startsAt.getTime()) return false;
  return !offer.schedule.endsAt || nowMs < offer.schedule.endsAt.getTime();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Longest "Gets you the free bag" label the bag shows; a longer one uses the generic wording. */
export const EARNED_LABEL_MAX = 28;

/** Words that have no singular ("the free socks"). */
const PLURAL_ONLY = new Set(['socks', 'shorts', 'leggings', 'trousers', 'pants', 'jeans', 'sunglasses']);
/** Words the general rules below get wrong. */
const SINGULAR: Readonly<Record<string, string>> = { hoodies: 'hoodie' };

/**
 * A short lower-case singular word for a category name, for the bag's "Gets you the free bag"
 * label: the first part of the name ("Bags & gear" → "bag", "Grips & protectors" → "grip",
 * "Socks" → "socks"). Null when the name has no single plain word to use.
 */
export function shortItemWord(categoryName: string | null | undefined): string | null {
  const first = (categoryName ?? '').split(/[&,/]/)[0]!.trim().toLowerCase();
  if (!/^[a-z]+(-[a-z]+)?$/.test(first)) return null;
  if (PLURAL_ONLY.has(first)) return first;
  const known = SINGULAR[first];
  if (known) return known;
  if (first.endsWith('ies') && first.length > 4) return `${first.slice(0, -3)}y`;
  if (/(ss|x|ch|sh)es$/.test(first)) return first.slice(0, -2);
  if (first.endsWith('s') && !first.endsWith('ss')) return first.slice(0, -1);
  return first;
}

/**
 * The small label under a bag item that pays full price because it earns another item's Buy X
 * Get Y discount: "Gets you the free bag" or "Gets you 50% off the bag". With no short word, or
 * when the text would be longer than `EARNED_LABEL_MAX`: "Gets you a free item" /
 * "Gets you 50% off an item".
 */
export function earnedItemLabel(percent: number, word: string | null): string {
  const free = percent >= 100;
  if (word) {
    const text = free ? `Gets you the free ${word}` : `Gets you ${percent}% off the ${word}`;
    if (text.length <= EARNED_LABEL_MAX) return text;
  }
  return free ? 'Gets you a free item' : `Gets you ${percent}% off an item`;
}
