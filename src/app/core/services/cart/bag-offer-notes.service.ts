import { computed, inject, Service, signal } from '@angular/core';
import { AuthService } from '@core/services/auth/auth.service';
import { OffersService } from '@core/services/offers/offers.service';
import {
  bagKeyOf,
  dismissOfferNote,
  nextBagNotes,
  NO_BAG_NOTES,
  type BagGiftNote,
  type BagNotes,
  type BagOfferNote,
  type BagOfferState,
} from './bag-offer-notes';
import type { BagOfferLook } from './bag-offer-state';
import { cartLineKey } from './cart.model';
import { CartService } from './cart.service';

/** Who looked at the bag: the bag drawer or checkout (each compares with its own last look). */
export type BagNotesSource = 'bag' | 'checkout';

/**
 * Tells the shopper when an offer stops applying to their bag during this visit: "The <offer>
 * offer has ended, so your total changed." above the items, and "Your free shirt is no longer
 * available." under an item whose gift can't be given any more. The bag drawer and checkout
 * report what the bag gets from offers each time it is priced (`observe`); the notes are shared,
 * so a change seen in the bag also shows at checkout. They belong to one bag: any change to the
 * bag, signing in or out included, drops them. Browser only; nothing is stored.
 */
@Service()
export class BagOfferNotesService {
  readonly #cart = inject(CartService);
  readonly #auth = inject(AuthService);
  readonly #offers = inject(OffersService);

  readonly #notes = signal<BagNotes>(NO_BAG_NOTES);
  readonly #previous = new Map<BagNotesSource, BagOfferState>();

  /** The current bag and its owner (`bagKeyOf`); notes made for another bag are hidden. */
  readonly bagKey = computed(() => bagKeyOf(this.#cart.lines(), this.#auth.user()?.uid ?? null, cartLineKey));

  readonly #current = computed(() => {
    const notes = this.#notes();
    return notes.bagKey === this.bagKey() ? notes : NO_BAG_NOTES;
  });

  /** Notes above the items: offers that were giving the bag something and have ended. */
  readonly offerNotes = computed<readonly BagOfferNote[]>(() => this.#current().offers);
  /** Notes under items: free gifts that can no longer be given. */
  readonly giftNotes = computed<readonly BagGiftNote[]>(() => this.#current().gifts);

  /**
   * Records one look at the bag. Ignored until the bag and sign-in have loaded, so the first
   * load, signing in and signing out never read as a change.
   */
  observe(source: BagNotesSource, look: BagOfferLook): void {
    if (!this.#cart.ready() || !this.#auth.isAuthReady()) return;
    if (look.state.bagKey !== this.bagKey()) return;
    const previous = this.#previous.get(source) ?? null;
    this.#previous.set(source, look.state);
    const usedUp = new Set(this.#offers.usedUpIds());
    this.#notes.update((notes) =>
      nextBagNotes({
        notes,
        previous,
        next: look.state,
        isLive: (offerId) => look.liveIds.has(offerId),
        usedUp,
      }),
    );
  }

  /** The shopper closed an offer's note (✕). */
  dismiss(offerId: string): void {
    this.#notes.update((notes) => dismissOfferNote(notes, offerId));
  }
}
