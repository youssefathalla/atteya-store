// Pure, with type-only imports: `npm run test:cart` loads this file straight from source.
import type { CartLineDraft } from './cart.model';

/** One free gift a bag line gets right now, keyed by `bagGiftKey`. */
export interface BagGiftState {
  /** The bag line it comes with (`cartLineKey`). */
  readonly lineKey: string;
  /** The gift's name from its offer ("Free shirt"). */
  readonly name: string;
}

/**
 * What the bag gets from offers at one moment, for one bag (`bagKey`). Built only once the bag,
 * its products and the live offers have all loaded, so a load never reads as a change.
 */
export interface BagOfferState {
  /** The bag lines and the person it was priced for (`bagKeyOf`). */
  readonly bagKey: string;
  /**
   * Offers that change what the bag costs (per-item price offers, Buy X Get Y, and at checkout
   * Free shipping), id → the offer's title. Free gift offers are not here: a gift costs nothing,
   * so losing one is told under its item instead (`gifts`).
   */
  readonly offers: ReadonlyMap<string, string>;
  /** Free gifts that can still be given, by `bagGiftKey`. */
  readonly gifts: ReadonlyMap<string, BagGiftState>;
}

/** Why an offer stopped applying: it ended (or was paused), or this shopper used it up. */
export type BagOfferNoteKind = 'ended' | 'used';

/** One note above the items: an offer that was giving the bag something and no longer does. */
export interface BagOfferNote {
  readonly offerId: string;
  readonly kind: BagOfferNoteKind;
  readonly title: string;
}

/** One note under an item: a free gift that can no longer be given. */
export interface BagGiftNote {
  /** `bagGiftKey` of the gift. */
  readonly key: string;
  readonly lineKey: string;
  readonly name: string;
}

/** The notes for one bag. They belong to `bagKey` and are dropped when the bag changes. */
export interface BagNotes {
  readonly bagKey: string | null;
  readonly offers: readonly BagOfferNote[];
  readonly gifts: readonly BagGiftNote[];
  /** Offers whose note the shopper closed; they stay away until the bag changes or they apply again. */
  readonly dismissed: readonly string[];
}

export const NO_BAG_NOTES: BagNotes = { bagKey: null, offers: [], gifts: [], dismissed: [] };

/**
 * The bag's identity for the notes: every line (product, choices, gifts and quantity) and who it
 * belongs to (`uid`, empty for a guest). Any change, signing in or out included, starts afresh.
 * `lineKey` is `cartLineKey` (passed in so this file stays free of runtime imports).
 */
export function bagKeyOf(
  lines: readonly CartLineDraft[],
  uid: string | null,
  lineKey: (line: CartLineDraft) => string,
): string {
  return `${uid ?? ''}#${lines.map((line) => `${lineKey(line)}*${line.quantity}`).join('#')}`;
}

/** Key of one free gift on one bag line. */
export function bagGiftKey(lineKey: string, offerId: string, giftId: string): string {
  return `${lineKey}|${offerId}/${giftId}`;
}

/**
 * The notes after the bag was looked at again (`next`), given what it got from offers the last
 * time (`previous`). Only a change seen during this visit counts: with no `previous`, or when
 * `previous` priced another bag (the shopper changed it, signed in or out), nothing is added.
 *
 * - An offer in `previous.offers` that is gone from `next.offers` gets a note only when it is no
 *   longer live (`isLive`): it ended, was paused or archived, or the order callables said it is
 *   full. One that just lost to a better offer is not mentioned. `usedUp` names the offers this
 *   shopper has already used up ("You've already used…"); the rest have ended.
 * - A gift in `previous.gifts` that is gone from `next.gifts` gets a note under its item.
 * - A note whose offer or gift applies again is dropped, and a bag that changed drops them all.
 * - One note per offer and per gift; a dismissed note stays away (`dismissed`) until the bag
 *   changes or the offer applies again.
 */
export function nextBagNotes(args: {
  readonly notes: BagNotes;
  readonly previous: BagOfferState | null;
  readonly next: BagOfferState;
  readonly isLive: (offerId: string) => boolean;
  readonly usedUp: ReadonlySet<string>;
}): BagNotes {
  const { previous, next, isLive, usedUp } = args;
  const kept = args.notes.bagKey === next.bagKey ? args.notes : { ...NO_BAG_NOTES, bagKey: next.bagKey };
  const offers = kept.offers.filter((note) => !next.offers.has(note.offerId));
  const gifts = kept.gifts.filter((note) => !next.gifts.has(note.key));
  const dismissed = kept.dismissed.filter((offerId) => !next.offers.has(offerId));

  if (previous && previous.bagKey === next.bagKey) {
    for (const [offerId, title] of previous.offers) {
      if (next.offers.has(offerId) || isLive(offerId)) continue;
      if (dismissed.includes(offerId) || offers.some((note) => note.offerId === offerId)) continue;
      offers.push({ offerId, kind: usedUp.has(offerId) ? 'used' : 'ended', title });
    }
    for (const [key, gift] of previous.gifts) {
      if (next.gifts.has(key) || gifts.some((note) => note.key === key)) continue;
      gifts.push({ key, lineKey: gift.lineKey, name: gift.name });
    }
  }

  const same =
    kept === args.notes &&
    offers.length === kept.offers.length &&
    gifts.length === kept.gifts.length &&
    dismissed.length === kept.dismissed.length;
  return same ? args.notes : { bagKey: next.bagKey, offers, gifts, dismissed };
}

/**
 * The notes without one offer's note (the shopper closed it). It is remembered as dismissed, so
 * the bag and checkout (which each compare with their own last look) never bring it back.
 */
export function dismissOfferNote(notes: BagNotes, offerId: string): BagNotes {
  if (!notes.offers.some((note) => note.offerId === offerId)) return notes;
  return {
    ...notes,
    offers: notes.offers.filter((note) => note.offerId !== offerId),
    dismissed: [...notes.dismissed, offerId],
  };
}

/**
 * "The Autumn Sale offer has ended, so your total changed." or "You've already used the Autumn
 * Sale offer, so your total changed." (same wording as the order refusals).
 */
export function offerNoteText(note: Pick<BagOfferNote, 'kind' | 'title'>): string {
  const title = note.title.trim();
  if (note.kind === 'used') {
    return title
      ? `You've already used the ${title} offer, so your total changed.`
      : "You've already used an offer in your bag, so your total changed.";
  }
  return title
    ? `The ${title} offer has ended, so your total changed.`
    : 'An offer in your bag has ended, so your total changed.';
}

/** "Your free shirt is no longer available." (the gift's name starts lower case mid-sentence). */
export function giftNoteText(giftName: string): string {
  const name = giftName.trim() || 'free gift';
  const inSentence = /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;
  return `Your ${inSentence} is no longer available.`;
}
