import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  PLATFORM_ID,
  Service,
  signal,
  untracked,
} from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import {
  FAVORITE_ITEMS,
  FAVORITES_COLLECTION,
  MAX_FAVORITES,
  type FavoriteItem,
} from './favorite.model';
import { FavoriteItemSchema } from './favorite.schema';

@Service()
export class FavoritesService {
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #snackbar = inject(SnackbarService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #items = signal<readonly FavoriteItem[]>([]);
  readonly #ready = signal(false);
  readonly #pending = signal<ReadonlySet<string>>(new Set());

  #unsubscribe: Unsubscribe | null = null;
  #attachedUid: string | null = null;
  #readyWaiters: (() => void)[] = [];

  readonly items = this.#items.asReadonly();
  readonly ready = this.#ready.asReadonly();
  readonly ids = computed(() => new Set(this.#items().map((item) => item.productId)));
  readonly count = computed(() => this.#items().length);

  constructor() {
    effect(() => {
      const ready = this.#auth.isAuthReady();
      const uid = this.#auth.user()?.uid ?? null;
      untracked(() => this.#syncListener(ready, uid));
    });
  }

  has(productId: string): boolean {
    return this.ids().has(productId);
  }

  isPending(productId: string): boolean {
    return this.#pending().has(productId);
  }

  /** Resolves once the favorites listener has delivered (or signed-out empty state). */
  async waitUntilReady(): Promise<void> {
    if (this.#ready()) return;
    await new Promise<void>((resolve) => {
      this.#readyWaiters.push(resolve);
    });
  }

  /**
   * Toggle favorite for a signed-in shopper.
   * Waits for the listener so local state is warm, then confirms create vs delete
   * with a live `getDoc` (avoids re-create races rejected by create-only rules).
   * Returns `'added'` / `'removed'`, or `null` when not signed in / aborted.
   */
  async toggle(productId: string, slug: string): Promise<'added' | 'removed' | null> {
    if (!this.#isBrowser || !this.#auth.isAuthReady()) return null;
    const uid = this.#auth.user()?.uid;
    if (!uid) return null;

    const id = productId.trim();
    const productSlug = slug.trim();
    if (!id || !productSlug) return null;
    if (this.isPending(id)) return null;

    this.#markPending(id, true);
    try {
      await this.waitUntilReady();
      if (this.#auth.user()?.uid !== uid) return null;

      const ref = this.#itemRef(uid, id);
      // Live read beats a stale local `has()` if the first snapshot is still settling.
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await deleteDoc(ref);
        this.#items.update((list) => list.filter((item) => item.productId !== id));
        return 'removed';
      }

      return await this.#createFavorite(uid, id, productSlug);
    } catch {
      this.#snackbar.error("We couldn't update your favorites. Try again.");
      return null;
    } finally {
      this.#markPending(id, false);
    }
  }

  /**
   * Add-only for post-sign-in heart recovery. Respects `MAX_FAVORITES`.
   * Does not remove an already-saved product. Returns `'added'`, `'exists'`, or `null`.
   */
  async add(productId: string, slug: string): Promise<'added' | 'exists' | null> {
    if (!this.#isBrowser || !this.#auth.isAuthReady()) return null;
    const uid = this.#auth.user()?.uid;
    if (!uid) return null;

    const id = productId.trim();
    const productSlug = slug.trim();
    if (!id || !productSlug) return null;
    if (this.isPending(id)) return null;

    this.#markPending(id, true);
    try {
      await this.waitUntilReady();
      if (this.#auth.user()?.uid !== uid) return null;

      const ref = this.#itemRef(uid, id);
      const snap = await getDoc(ref);
      if (snap.exists()) return 'exists';

      const created = await this.#createFavorite(uid, id, productSlug);
      return created === 'added' ? 'added' : null;
    } catch {
      this.#snackbar.error("We couldn't update your favorites. Try again.");
      return null;
    } finally {
      this.#markPending(id, false);
    }
  }

  async #createFavorite(
    uid: string,
    id: string,
    productSlug: string,
  ): Promise<'added' | null> {
    if (this.#items().length >= MAX_FAVORITES) {
      this.#snackbar.error(`You can favorite up to ${MAX_FAVORITES} products.`);
      return null;
    }

    await setDoc(this.#itemRef(uid, id), {
      productId: id,
      slug: productSlug,
      addedAt: serverTimestamp(),
    });
    if (!this.has(id)) {
      this.#items.update((list) => [
        { productId: id, slug: productSlug, addedAt: new Date() },
        ...list,
      ]);
    }
    return 'added';
  }

  #syncListener(authReady: boolean, uid: string | null): void {
    if (!this.#isBrowser) {
      this.#items.set([]);
      this.#setReady(true);
      return;
    }
    if (!authReady) {
      this.#setReady(false);
      return;
    }
    if (!uid) {
      this.#detach();
      this.#items.set([]);
      this.#setReady(true);
      return;
    }
    if (this.#attachedUid === uid && this.#unsubscribe) {
      // Already listening; keep current ready flag (true after first snap).
      return;
    }
    this.#detach();
    this.#attachedUid = uid;
    this.#setReady(false);

    const converter = createValibotConverter(FavoriteItemSchema);
    const items = collection(
      this.#firestore,
      FAVORITES_COLLECTION,
      uid,
      FAVORITE_ITEMS,
    ).withConverter(converter);

    this.#unsubscribe = onSnapshot(
      items,
      (snap) => {
        const next = snap.docs
          .map((entry) => entry.data())
          .sort((a, b) => timeMs(b.addedAt) - timeMs(a.addedAt));
        this.#items.set(next);
        this.#setReady(true);
      },
      () => {
        this.#items.set([]);
        this.#setReady(true);
        this.#snackbar.error("We couldn't load your favorites.");
      },
    );
  }

  #setReady(ready: boolean): void {
    this.#ready.set(ready);
    if (!ready) return;
    const waiters = this.#readyWaiters;
    this.#readyWaiters = [];
    for (const resolve of waiters) resolve();
  }

  #detach(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#attachedUid = null;
  }

  #itemRef(uid: string, productId: string) {
    return doc(this.#firestore, FAVORITES_COLLECTION, uid, FAVORITE_ITEMS, productId);
  }

  #markPending(productId: string, pending: boolean): void {
    this.#pending.update((current) => {
      const next = new Set(current);
      if (pending) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }
}

function timeMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const ms = (toMillis as () => number).call(value);
      if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
    }
  }
  return 0;
}
