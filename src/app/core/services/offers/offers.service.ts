import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { collection, limit, query, where } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { signalCollection } from '@shared/utils/firebase/firestore-signals';
import { liveOffers, type Offer } from './engine';
import { OFFERS_COLLECTION, toEngineOffer } from './offer.model';
import { OfferDocSchema } from './offer.schema';

@Service()
export class OffersService {
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);

  readonly #now = signal<Date>(new Date());
  /** How far the server's clock is ahead of this device (ms), from `syncClock`; 0 until then. */
  #clockOffsetMs = 0;
  readonly #failed = signal(false);
  /**
   * Offers the order callables said have ended for this shopper (`details.endedOfferId`): left out
   * of every price on this visit, so the bag and checkout show the total the server will charge.
   */
  readonly #ended = signal<ReadonlySet<string>>(new Set());
  /** Of `#ended`, the offers this shopper has already used up (`details.reason: 'used'`). */
  readonly #usedUp = signal<ReadonlySet<string>>(new Set());

  readonly #offersCollection = collection(this.#firestore, OFFERS_COLLECTION).withConverter(
    createValibotConverter(OfferDocSchema),
  );

  readonly #offerDocs = signalCollection(
    query(
      this.#offersCollection,
      where('active', '==', true),
      where('visibility', '==', 'public'),
      limit(100),
    ),
    { onError: () => this.#failed.set(true) },
  );

  readonly ready = computed(() => this.#offerDocs() !== undefined);
  /**
   * The offer clock (moves every minute in the browser). Bag and checkout pricing read it, so an
   * offer whose time is up stops discounting without waiting for the bag to change.
   */
  readonly now = this.#now.asReadonly();
  readonly failed = this.#failed.asReadonly();

  readonly all = computed<readonly Offer[]>(() => {
    const ended = this.#ended();
    return (this.#offerDocs() ?? [])
      .map((doc) => toEngineOffer(doc))
      .filter((offer) => !offer.archived && !ended.has(offer.id));
  });

  /** Ids of the offers left out with `markEnded`, sent with each order so the server agrees. */
  readonly endedIds = computed<readonly string[]>(() => Array.from(this.#ended()));
  /** Ids of the offers left out because this shopper already used them up (the bag's notes say so). */
  readonly usedUpIds = computed<readonly string[]>(() => Array.from(this.#usedUp()));

  readonly live = computed<readonly Offer[]>(() =>
    liveOffers(this.all(), {
      now: this.#now(),
      signedIn: this.#auth.offerSignedIn(),
    }),
  );

  /**
   * Leaves an offer out of every price for the rest of this visit (it has ended for this shopper).
   * `used`: this shopper already used it up (rather than the offer ending for everyone).
   */
  markEnded(offerId: string, reason: 'ended' | 'used' = 'ended'): void {
    if (reason === 'used' && !this.#usedUp().has(offerId)) {
      this.#usedUp.update((usedUp) => new Set([...usedUp, offerId]));
    }
    if (this.#ended().has(offerId)) return;
    this.#ended.update((ended) => new Set([...ended, offerId]));
  }

  /**
   * Moves the offer clock to the server's time (`nowMs` from a refused order), so a device whose
   * clock is off prices offers on the same clock as the order callables. The clock also ticks at
   * once (it otherwise moves once a minute); a difference under 10 seconds keeps the old offset.
   */
  syncClock(serverNowMs: number): void {
    const offset = serverNowMs - Date.now();
    if (Math.abs(offset - this.#clockOffsetMs) >= 10_000) this.#clockOffsetMs = offset;
    this.#now.set(new Date(Date.now() + this.#clockOffsetMs));
  }

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      const interval = setInterval(() => {
        this.#now.set(new Date(Date.now() + this.#clockOffsetMs));
      }, 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(interval));
    }
  }
}
