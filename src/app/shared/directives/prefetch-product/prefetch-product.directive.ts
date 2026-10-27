import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
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
 * Keyboard: focus-visible, after the same 100 ms rest, so tabbing through a grid does not read every card.
 */
@Directive({
  selector: '[appPrefetchProduct]',
  host: {
    '(pointerenter)': 'onEnter($event)',
    '(pointerleave)': 'cancel()',
    '(pointerdown)': 'onDown($event)',
    '(pointerup)': 'onUp()',
    '(pointercancel)': 'cancelPress()',
    '(focusin)': 'onFocus()',
    '(focusout)': 'cancel()',
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
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.cancel());
    // Host bindings are not passive and mark the view dirty. Wheel and move fire every frame.
    afterNextRender(() => {
      const el = this.#host.nativeElement;
      const onWheel = (): void => this.onWheel();
      const onMove = (event: PointerEvent): void => this.onMove(event);
      el.addEventListener('wheel', onWheel, { passive: true });
      el.addEventListener('pointermove', onMove, { passive: true });
      destroyRef.onDestroy(() => {
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('pointermove', onMove);
      });
    });
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
    this.#arm();
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
