import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  PLATFORM_ID,
  Service,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import {
  addCartLine,
  clampLineQuantity,
  MAX_CART_LINES,
  mergeCartLines,
  type CartLineDraft,
} from './cart.model';
import { CartDocSchema, parseCartLines } from './cart.schema';

/** Guest bag in this browser. Signed-in shoppers keep their bag in `carts/{uid}` instead. */
const STORAGE_KEY = 'atteya-cart-v1';
const CARTS_COLLECTION = 'carts';
/** How long `clear()` waits for the account bag write before a full-page redirect goes on anyway. */
const CLEAR_WAIT_MS = 3000;

type CartMutation = (lines: readonly CartLineDraft[]) => readonly CartLineDraft[];

/**
 * Whose bag this is:
 * - `pending`: browser auth not known yet. Shows (and saves to) the guest bag; a signed-in
 *   shopper's guest bag is empty after their first merge, so nothing wrong shows meanwhile.
 * - `guest`: signed out. Lines live in `localStorage`.
 * - `account`: signed in. Lines live in `carts/{uid}`, kept live with `onSnapshot`.
 */
type CartOwner = { readonly kind: 'pending' } | { readonly kind: 'guest' } | { readonly kind: 'account'; readonly uid: string };

@Service()
export class CartService {
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #destroyRef = inject(DestroyRef);
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #snackbar = inject(SnackbarService);

  readonly #lines = signal<readonly CartLineDraft[]>([]);
  /** True once the bag of the current person (guest or account) is known. */
  readonly #ready = signal(!this.#isBrowser);

  #owner: CartOwner = { kind: 'pending' };
  /** Bumped on every owner change, so late listener callbacks and merges of an old owner are ignored. */
  #generation = 0;
  #unsubscribe: Unsubscribe | null = null;
  /** Changes made while the account bag was still loading; applied to the first snapshot. */
  #queued: CartMutation[] = [];
  #readyWaiters: (() => void)[] = [];

  readonly lines = this.#lines.asReadonly();
  readonly ready = this.#ready.asReadonly();
  readonly count = computed(() => this.#lines().reduce((sum, line) => sum + line.quantity, 0));
  readonly isEmpty = computed(() => this.#lines().length === 0);

  constructor() {
    if (!this.#isBrowser) return;

    this.#lines.set(readStored());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && this.#owner.kind !== 'account') {
        this.#lines.set(readStored());
      }
    };
    window.addEventListener('storage', onStorage);
    this.#destroyRef.onDestroy(() => {
      window.removeEventListener('storage', onStorage);
      this.#detach();
    });

    effect(() => {
      const authReady = this.#auth.isAuthReady();
      const uid = this.#auth.user()?.uid ?? null;
      untracked(() => this.#syncOwner(authReady, uid));
    });
  }

  /** Resolves once the current person's bag has loaded (an account bag after its first snapshot). */
  async waitUntilReady(): Promise<void> {
    if (this.#ready()) return;
    await new Promise<void>((resolve) => this.#readyWaiters.push(resolve));
  }

  add(line: CartLineDraft): void {
    let full = false;
    void this.#mutate((lines) => {
      const next = addCartLine(lines, line);
      full = next === lines;
      return next;
    });
    if (full) {
      this.#snackbar.error('Your bag is full. Remove an item to add this one.');
    }
  }

  removeAt(index: number): void {
    void this.#mutate((lines) => {
      if (index < 0 || index >= lines.length) return lines;
      const next = [...lines];
      next.splice(index, 1);
      return next;
    });
  }

  setQuantity(index: number, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity !== clampLineQuantity(quantity)) return;
    void this.#mutate((lines) => {
      if (index < 0 || index >= lines.length) return lines;
      const next = [...lines];
      next[index] = { ...next[index], quantity };
      return next;
    });
  }

  /**
   * Empties the bag (after an order is placed). Resolves when an account bag is saved,
   * or after a short wait, so a full-page redirect right after does not drop the write.
   */
  async clear(): Promise<void> {
    await Promise.race([this.#mutate(() => []), delay(CLEAR_WAIT_MS)]);
  }

  #mutate(change: CartMutation): Promise<void> {
    const owner = this.#owner;
    if (owner.kind !== 'account') {
      const next = change(this.#lines());
      this.#lines.set(next);
      if (this.#isBrowser) writeStored(next);
      return Promise.resolve();
    }
    if (!this.#ready()) {
      // Show it now; the first snapshot re-applies it to the saved bag and saves the result.
      this.#queued.push(change);
      this.#lines.update(change);
      return Promise.resolve();
    }
    const before = this.#lines();
    const next = change(before);
    if (next === before) return Promise.resolve();
    this.#lines.set(next);
    return this.#save(owner.uid, next);
  }

  #syncOwner(authReady: boolean, uid: string | null): void {
    if (!authReady) return;
    const previous = this.#owner;

    if (uid === null) {
      if (previous.kind === 'guest') return;
      this.#detach();
      this.#generation++;
      this.#owner = { kind: 'guest' };
      if (previous.kind === 'account') {
        // Signing out empties this browser's bag; the account bag stays saved for next time.
        removeStored();
        this.#lines.set([]);
      } else {
        this.#lines.set(readStored());
      }
      this.#setReady(true);
      return;
    }

    if (previous.kind === 'account' && previous.uid === uid) return;
    this.#detach();
    const generation = ++this.#generation;
    this.#owner = { kind: 'account', uid };
    this.#setReady(false);
    // Another account's items must never show. A guest's items stay on screen while they merge.
    if (previous.kind === 'account') this.#lines.set([]);
    void this.#attach(uid, generation);
  }

  async #attach(uid: string, generation: number): Promise<void> {
    const ref = this.#cartRef(uid);
    // Take the guest bag first so another tab signing in at the same time doesn't add it twice.
    const guest = readStored();
    if (guest.length > 0) {
      removeStored();
      try {
        await runTransaction(this.#firestore, async (transaction) => {
          const snap = await transaction.get(ref);
          const saved = linesFromDoc(snap.data());
          transaction.set(ref, cartDocument(mergeCartLines(saved, guest)));
        });
      } catch {
        // Keep the items on this device so the next page load tries again.
        writeStored(mergeCartLines(readStored(), guest));
        if (generation === this.#generation) {
          this.#snackbar.error("We couldn't add your earlier bag items to your account. Refresh the page to try again.");
        }
      }
    }
    if (generation !== this.#generation) return;

    this.#unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (generation !== this.#generation) return;
        const saved = linesFromDoc(snap.data());
        if (this.#ready()) {
          this.#lines.set(saved);
          return;
        }
        const queued = this.#queued;
        this.#queued = [];
        const next = queued.reduce<readonly CartLineDraft[]>((lines, change) => change(lines), saved);
        this.#lines.set(next);
        this.#setReady(true);
        if (queued.length > 0) void this.#save(uid, next);
      },
      () => {
        if (generation !== this.#generation) return;
        this.#queued = [];
        this.#lines.set([]);
        this.#setReady(true);
        this.#snackbar.error("We couldn't load your bag. Refresh the page to try again.");
      },
    );
  }

  async #save(uid: string, lines: readonly CartLineDraft[]): Promise<void> {
    try {
      await setDoc(this.#cartRef(uid), cartDocument(lines));
    } catch {
      if (this.#owner.kind === 'account' && this.#owner.uid === uid) {
        this.#snackbar.error("We couldn't save your bag. Try again.");
      }
    }
  }

  #detach(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#queued = [];
  }

  #setReady(ready: boolean): void {
    this.#ready.set(ready);
    if (!ready) return;
    const waiters = this.#readyWaiters;
    this.#readyWaiters = [];
    for (const resolve of waiters) resolve();
  }

  #cartRef(uid: string): DocumentReference {
    return doc(this.#firestore, CARTS_COLLECTION, uid);
  }
}

/** `carts/{uid}` body: product ids, choices and quantities only. Prices are never stored. */
function cartDocument(lines: readonly CartLineDraft[]) {
  return {
    lines: lines.slice(0, MAX_CART_LINES).map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      selection: { ...line.selection },
      quantity: clampLineQuantity(line.quantity),
    })),
    updatedAt: serverTimestamp(),
  };
}

function linesFromDoc(data: unknown): readonly CartLineDraft[] {
  if (data === undefined) return [];
  const parsed = v.safeParse(CartDocSchema, data);
  return parsed.success ? parseCartLines(parsed.output.lines) : [];
}

function readStored(): readonly CartLineDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseCartLines(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeStored(lines: readonly CartLineDraft[]): void {
  try {
    if (lines.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage full or blocked: the bag still works for this visit.
  }
}

function removeStored(): void {
  writeStored([]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
