import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID, Service, computed, signal } from '@angular/core';
import { cartLineKey, type CartLineDraft } from './cart.model';

const STORAGE_KEY = 'atteya-cart-v1';

@Service()
export class CartService {
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);

  readonly #lines = signal<readonly CartLineDraft[]>([]);

  readonly lines = this.#lines.asReadonly();
  readonly count = computed(() => this.#lines().reduce((sum, line) => sum + line.quantity, 0));
  readonly isEmpty = computed(() => this.#lines().length === 0);

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      this.#lines.set(readStored());
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) {
          this.#lines.set(readStored());
        }
      };
      window.addEventListener('storage', onStorage);
      this.#destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
    }
  }

  add(line: CartLineDraft): void {
    const key = cartLineKey(line);
    const next = [...this.#lines()];
    const index = next.findIndex((entry) => cartLineKey(entry) === key);
    if (index >= 0) {
      const merged = { ...next[index], quantity: Math.min(20, next[index].quantity + line.quantity) };
      next[index] = merged;
    } else {
      next.push({ ...line, quantity: Math.min(20, Math.max(1, line.quantity)) });
    }
    this.#commit(next);
  }

  removeAt(index: number): void {
    const next = [...this.#lines()];
    if (index < 0 || index >= next.length) return;
    next.splice(index, 1);
    this.#commit(next);
  }

  setQuantity(index: number, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
    const next = [...this.#lines()];
    if (index < 0 || index >= next.length) return;
    next[index] = { ...next[index], quantity };
    this.#commit(next);
  }

  clear(): void {
    this.#commit([]);
  }

  #commit(lines: readonly CartLineDraft[]): void {
    this.#lines.set(lines);
    if (!isPlatformBrowser(this.#platformId)) return;
    if (lines.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }
}

function readStored(): readonly CartLineDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const lines: CartLineDraft[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      if (typeof record['productId'] !== 'string') continue;
      const quantity =
        typeof record['quantity'] === 'number' && Number.isInteger(record['quantity'])
          ? record['quantity']
          : 1;
      lines.push({
        productId: record['productId'],
        variantId: typeof record['variantId'] === 'string' ? record['variantId'] : null,
        selection: readSelection(record['selection']),
        quantity: Math.min(20, Math.max(1, quantity)),
      });
    }
    return lines;
  } catch {
    return [];
  }
}

function readSelection(raw: unknown): Readonly<Record<string, string>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}
