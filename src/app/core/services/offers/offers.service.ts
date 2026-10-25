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
  readonly #failed = signal(false);

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
  readonly failed = this.#failed.asReadonly();

  readonly all = computed<readonly Offer[]>(() =>
    (this.#offerDocs() ?? [])
      .map((doc) => toEngineOffer(doc))
      .filter((offer) => !offer.archived),
  );

  readonly live = computed<readonly Offer[]>(() =>
    liveOffers(this.all(), {
      now: this.#now(),
      signedIn: Boolean(this.#auth.user()),
    }),
  );

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      const interval = setInterval(() => {
        this.#now.set(new Date());
      }, 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(interval));
    }
  }
}
