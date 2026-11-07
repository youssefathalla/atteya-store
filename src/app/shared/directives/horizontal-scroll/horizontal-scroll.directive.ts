import {
  Directive,
  ElementRef,
  inject,
  input,
  signal,
  PLATFORM_ID,
  DestroyRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[appHorizontalScroll]',
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

  protected readonly isDragging = signal(false);

  #isMouseDown = false;
  #startX = 0;
  #startScrollLeft = 0;
  #hasDragged = false;

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
      });
    }
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
    const containerRect = el.getBoundingClientRect();
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
      }
      this.#hasDragged = true;
      event.preventDefault();
      this.#el.nativeElement.scrollLeft = this.#startScrollLeft - dx;
    }
  }

  protected onMouseUpOrLeave(): void {
    if (this.#isMouseDown) {
      this.#isMouseDown = false;
      this.isDragging.set(false);

      if (this.#hasDragged && this.snapToItems()) {
        this.#snapToClosestItem();
      }
    }
  }

  #snapToClosestItem(): void {
    const el = this.#el.nativeElement;
    const containerRect = el.getBoundingClientRect();
    const children = Array.from(el.children) as HTMLElement[];

    const firstChild = children[0];
    if (!firstChild) return;

    let closestChild = firstChild;
    let minDistance = Infinity;

    for (const child of children) {
      const childRect = child.getBoundingClientRect();
      const distance = Math.abs(childRect.left - containerRect.left);
      if (distance < minDistance) {
        minDistance = distance;
        closestChild = child;
      }
    }

    const offset = closestChild.getBoundingClientRect().left - containerRect.left;
    if (Math.abs(offset) > 2) {
      this.#smoothScrollBy(el, offset);
    }
  }

  #smoothScrollBy(el: HTMLElement, delta: number): void {
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ left: delta, behavior: 'smooth' });
    } else {
      el.scrollLeft += delta;
    }
  }
}
