import {
  Directive,
  ElementRef,
  inject,
  input,
  signal,
  effect,
  PLATFORM_ID,
  DestroyRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  rowItemTarget,
  rowScrollProgress,
  rowSnapEdge,
  scrollRowByItem,
} from '@shared/utils/row-scroll.utils';

/** A release faster than this (px per ms) carries on to the next card in that direction. */
const FLING_SPEED = 0.5;
/** A pause longer than this before letting go means no flick. */
const FLING_MAX_PAUSE_MS = 100;
/** Put card snapping back after the settle scroll, even where `scrollend` never fires. */
const SETTLE_FALLBACK_MS = 600;

@Directive({
  selector: '[appHorizontalScroll]',
  exportAs: 'horizontalScroll',
  host: {
    '[class.cursor-grab]': 'enableDrag() && !isDragging()',
    '[class.cursor-grabbing]': 'isDragging()',
    '[class.select-none]': 'isDragging()',
    '(wheel)': 'onWheel($event)',
    '(mousedown)': 'onMouseDown($event)',
    '(dragstart)': 'onDragStart($event)',
    '(window:mousemove)': 'onMouseMove($event)',
    '(window:mouseup)': 'onMouseUpOrLeave()',
  },
})
export class HorizontalScrollDirective {
  readonly #el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #destroyRef = inject(DestroyRef);
  readonly #isBrowser = isPlatformBrowser(this.#platformId);

  /**
   * Scroll by 1 full item per mouse wheel action.
   * @default true
   */
  readonly snapToItems = input<boolean>(true);

  /**
   * Speed multiplier for mouse wheel scrolling when not snapping to items.
   * @default 1.0
   */
  readonly wheelSpeed = input<number>(1.0);

  /**
   * Speed multiplier for mouse drag scrolling.
   * @default 1.0
   */
  readonly dragSpeed = input<number>(1.0);

  /**
   * Enable converting vertical mouse wheel to smooth horizontal scroll.
   * @default true
   */
  readonly enableWheel = input<boolean>(true);

  /**
   * Enable mouse drag-to-scroll.
   * @default true
   */
  readonly enableDrag = input<boolean>(true);

  /**
   * Keep `progress`, `canPrev` and `canNext` up to date for `app-row-scroll-nav`.
   * Off by default so small rows (card swatches) add no listeners.
   * @default false
   */
  readonly trackScroll = input<boolean>(false);

  protected readonly isDragging = signal(false);

  /** How far along the row is, 0 to 1 (1 when it can't scroll). Needs `trackScroll`. */
  readonly progress = signal(0);
  /** The row can move back. Needs `trackScroll`. */
  readonly canPrev = signal(false);
  /** The row can move forward. Needs `trackScroll`. */
  readonly canNext = signal(false);

  #isMouseDown = false;
  #startX = 0;
  #startScrollLeft = 0;
  #hasDragged = false;
  #lastX = 0;
  #lastTime = 0;
  #velocity = 0;
  /** Inline snap/smooth values from before the drag (a scroll lock may have set its own). */
  #savedSnapType = '';
  #savedBehavior = '';
  #snapSuspended = false;
  #stopSettleWatch: (() => void) | null = null;

  constructor() {
    if (this.#isBrowser) {
      const el = this.#el.nativeElement;
      const captureClickHandler = (event: MouseEvent) => {
        if (this.#hasDragged) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.#hasDragged = false;
        }
      };

      el.addEventListener('click', captureClickHandler, { capture: true });
      this.#destroyRef.onDestroy(() => {
        el.removeEventListener('click', captureClickHandler, { capture: true });
        this.#stopSettleWatch?.();
      });

      effect((onCleanup) => {
        if (!this.trackScroll()) return;
        onCleanup(this.#watchPosition(el));
      });
    }
  }

  /** Move one card forward (1) or back (-1), or to the row's end when no card is left that way. */
  step(direction: 1 | -1): void {
    if (!this.#isBrowser) return;
    scrollRowByItem(this.#el.nativeElement, direction);
  }

  #watchPosition(el: HTMLElement): () => void {
    const sync = (): void => {
      const state = rowScrollProgress(el);
      this.progress.set(state.progress);
      this.canPrev.set(state.canPrev);
      this.canNext.set(state.canNext);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    // Size changes (drawer opening, window resize) and cards added or removed.
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    resize?.observe(el);
    const children = typeof MutationObserver !== 'undefined' ? new MutationObserver(sync) : null;
    children?.observe(el, { childList: true });
    return () => {
      el.removeEventListener('scroll', sync);
      resize?.disconnect();
      children?.disconnect();
    };
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.#isBrowser || !this.enableWheel()) return;

    const el = this.#el.nativeElement;
    if (el.scrollWidth <= el.clientWidth) return;

    // If native horizontal scroll (touchpad gesture) is already dominant, don't intercept
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    if (event.deltaY !== 0) {
      // At the row's first or last item, hand the wheel back to the page.
      const max = el.scrollWidth - el.clientWidth;
      if (event.deltaY < 0 && el.scrollLeft <= 1) return;
      if (event.deltaY > 0 && el.scrollLeft >= max - 1) return;

      event.preventDefault();
      if (this.snapToItems()) {
        this.#scrollToNextItem(event.deltaY > 0 ? 1 : -1);
      } else {
        this.#smoothScrollBy(el, event.deltaY * this.wheelSpeed());
      }
    }
  }

  #scrollToNextItem(direction: 1 | -1): void {
    const el = this.#el.nativeElement;
    const containerRect = { left: rowSnapEdge(el) };
    const children = Array.from(el.children) as HTMLElement[];

    if (children.length === 0) {
      this.#smoothScrollBy(el, direction * 160);
      return;
    }

    if (direction === 1) {
      // Find the first child whose left edge is to the right of container start (+ threshold)
      const nextChild = children.find((child) => {
        const childRect = child.getBoundingClientRect();
        return childRect.left - containerRect.left > 12;
      });

      if (nextChild) {
        const offset = nextChild.getBoundingClientRect().left - containerRect.left;
        this.#smoothScrollBy(el, offset);
      } else {
        this.#smoothScrollBy(el, el.scrollWidth - el.scrollLeft);
      }
    } else {
      // Find the closest child whose left edge is to the left of container start (- threshold)
      const prevChildren = children.filter((child) => {
        const childRect = child.getBoundingClientRect();
        return childRect.left - containerRect.left < -12;
      });

      const prevChild = prevChildren.at(-1);
      if (prevChild) {
        const offset = prevChild.getBoundingClientRect().left - containerRect.left;
        this.#smoothScrollBy(el, offset);
      } else {
        this.#smoothScrollBy(el, -el.scrollLeft);
      }
    }
  }

  protected onMouseDown(event: MouseEvent): void {
    if (!this.#isBrowser || !this.enableDrag() || event.button !== 0) return;

    this.#isMouseDown = true;
    this.#hasDragged = false;
    this.#startX = event.clientX;
    this.#lastX = event.clientX;
    this.#lastTime = performance.now();
    this.#velocity = 0;
    this.#startScrollLeft = this.#el.nativeElement.scrollLeft;
  }

  /** Links and photos would start a native drag and swallow the mouse moves. */
  protected onDragStart(event: DragEvent): void {
    if (this.#isBrowser && this.enableDrag()) event.preventDefault();
  }

  protected onMouseMove(event: MouseEvent): void {
    if (!this.#isMouseDown) return;

    const dx = (event.clientX - this.#startX) * this.dragSpeed();

    if (Math.abs(dx) > 3) {
      if (!this.isDragging()) {
        this.isDragging.set(true);
        this.#suspendSnap();
      }
      this.#hasDragged = true;
      event.preventDefault();
      const now = performance.now();
      const elapsed = now - this.#lastTime;
      if (elapsed > 0) {
        this.#velocity = ((event.clientX - this.#lastX) * this.dragSpeed()) / elapsed;
      }
      this.#lastX = event.clientX;
      this.#lastTime = now;
      this.#el.nativeElement.scrollLeft = this.#startScrollLeft - dx;
    }
  }

  protected onMouseUpOrLeave(): void {
    if (!this.#isMouseDown) return;
    this.#isMouseDown = false;
    this.isDragging.set(false);
    if (!this.#snapSuspended) return;

    if (this.#hasDragged && this.snapToItems()) {
      this.#settle();
    } else {
      this.#restoreSnap();
    }
  }

  /**
   * CSS snapping and smooth scrolling fight a mouse drag: each move would animate, then
   * snap back to a card. Turn both off while dragging; `#settle` lands on a card after.
   */
  #suspendSnap(): void {
    const el = this.#el.nativeElement;
    this.#stopSettleWatch?.();
    if (!this.#snapSuspended) {
      this.#savedSnapType = el.style.scrollSnapType;
      this.#savedBehavior = el.style.scrollBehavior;
      this.#snapSuspended = true;
    }
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
  }

  #restoreSnap(): void {
    this.#stopSettleWatch?.();
    if (!this.#snapSuspended) return;
    const el = this.#el.nativeElement;
    el.style.scrollSnapType = this.#savedSnapType;
    el.style.scrollBehavior = this.#savedBehavior;
    this.#snapSuspended = false;
  }

  /** Glide to the nearest card (or the next one after a quick flick), then snap again. */
  #settle(): void {
    const el = this.#el.nativeElement;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const flicked =
      performance.now() - this.#lastTime < FLING_MAX_PAUSE_MS &&
      Math.abs(this.#velocity) > FLING_SPEED;
    const target = flicked
        ? rowItemTarget(el, this.#velocity < 0 ? 1 : -1)
        : this.#closestItemTarget(el, max);

    if (Math.abs(target - el.scrollLeft) <= 2) {
      this.#restoreSnap();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (): void => this.#restoreSnap();
    el.addEventListener('scrollend', done, { once: true });
    timer = setTimeout(done, SETTLE_FALLBACK_MS);
    this.#stopSettleWatch = () => {
      el.removeEventListener('scrollend', done);
      if (timer !== null) clearTimeout(timer);
      this.#stopSettleWatch = null;
    };
    el.scrollTo({ left: target, behavior: 'smooth' });
  }

  #closestItemTarget(el: HTMLElement, max: number): number {
    const containerLeft = rowSnapEdge(el);
    const children = Array.from(el.children) as HTMLElement[];
    let best = el.scrollLeft;
    let minDistance = Infinity;
    for (const child of children) {
      const target = Math.min(
        max,
        Math.max(0, el.scrollLeft + child.getBoundingClientRect().left - containerLeft),
      );
      const distance = Math.abs(target - el.scrollLeft);
      if (distance < minDistance) {
        minDistance = distance;
        best = target;
      }
    }
    return best;
  }

  #smoothScrollBy(el: HTMLElement, delta: number): void {
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ left: delta, behavior: 'smooth' });
    } else {
      el.scrollLeft += delta;
    }
  }
}
