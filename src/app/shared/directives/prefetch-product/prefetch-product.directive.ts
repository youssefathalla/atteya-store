import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { ProductCacheService } from '@core/services/products/product-cache.service';

const HOVER_DELAY_MS = 100;
const TOUCH_SCROLL_SLOP_PX = 8;

interface Press {
  x: number;
  y: number;
  moved: boolean;
}

/**
 * Warms one product on intent.
 * Mouse: 100 ms rest, or immediate pointerdown. A sweep or wheel-scroll resets that rest,
 * so cards passing under the cursor are not all fetched.
 * Touch: the read starts once the finger has stayed still (a drag is a scroll and is ignored).
 * Keyboard: focus-visible only, so a touch that focuses the link does not count as a second path.
 */
@Directive({
  selector: '[appPrefetchProduct]',
  host: {
    '(pointerenter)': 'onEnter($event)',
    '(pointerleave)': 'cancel()',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp()',
    '(pointercancel)': 'cancelPress()',
    '(wheel)': 'onWheel()',
    '(focusin)': 'onFocus()',
  },
})
export class PrefetchProductDirective {
  /** Product slug to warm. */
  readonly appPrefetchProduct = input.required<string>();

  readonly #cache = inject(ProductCacheService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  #timer: ReturnType<typeof setTimeout> | null = null;
  #press: Press | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  protected onEnter(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    this.#arm();
  }

  /** Scrolling the grid under a still cursor. Keep waiting for a real rest. */
  protected onWheel(): void {
    if (this.#press) this.#press.moved = true;
    this.#arm();
  }

  protected cancel(): void {
    if (this.#press) this.#press.moved = true;
    this.#clearTimer();
  }

  protected onDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      this.now();
      return;
    }
    this.#press = { x: event.clientX, y: event.clientY, moved: false };
    this.#arm();
  }

  protected onMove(event: PointerEvent): void {
    const press = this.#press;
    if (!press || press.moved) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (dx * dx + dy * dy <= TOUCH_SCROLL_SLOP_PX * TOUCH_SCROLL_SLOP_PX) return;
    press.moved = true;
    this.#clearTimer();
  }

  protected onUp(): void {
    const press = this.#press;
    if (!press) return;
    const moved = press.moved;
    this.#press = null;
    if (!moved) this.now();
  }

  protected cancelPress(): void {
    this.#press = null;
    this.#clearTimer();
  }

  protected onFocus(): void {
    if (this.#press) return;
    if (!this.#host.nativeElement.matches(':focus-visible')) return;
    this.now();
  }

  protected now(): void {
    this.#clearTimer();
    this.#press = null;
    this.#cache.prefetch(this.appPrefetchProduct());
  }

  #arm(): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      if (this.#press?.moved) return;
      this.now();
    }, HOVER_DELAY_MS);
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}
