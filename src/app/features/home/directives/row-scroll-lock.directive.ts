import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import type { gsap as GsapNamespace } from 'gsap';
import type { ScrollTrigger as ScrollTriggerClass } from 'gsap/ScrollTrigger';
import { rowItemTarget, scrollRowByItem } from '../utils/row-scroll';

type GsapApi = typeof GsapNamespace;
type GsapMatchMedia = ReturnType<GsapApi['matchMedia']>;
type ScrollTriggerApi = typeof ScrollTriggerClass;

/** Desktop with a mouse or trackpad, and motion allowed. Phones, tablets and reduced motion never lock. */
const LOCK_QUERY =
  '(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
/** Sticky desktop nav (`h-14`). The section only locks when it fits fully below it. */
const STICKY_BAR_PX = 56;
/** Rows that can move less than this don't lock. */
const MIN_TRAVEL_PX = 2;
/** Skip a row write this close to the page-driven position (keeps native trackpad scrolling smooth). */
const SYNC_TOLERANCE_PX = 3;
const REFRESH_DELAY_MS = 200;

/**
 * Home product rows (New Arrivals, Padel): on desktop, once the whole section is
 * in view, the section stays in place while page scrolling moves through the
 * cards (GSAP ScrollTrigger scrub). After the last card the page carries on.
 *
 * Put it on the `.scroll-row` element inside the section's `<section>`; the
 * section's parent (the component host) gets a spacer that supplies the scroll
 * distance. The lock is CSS `position: sticky`, not ScrollTrigger's fixed pin:
 * `<main>` is an `@container`, which makes it the containing block for fixed
 * elements, and a pin would also move Angular-owned nodes into a wrapper.
 */
@Directive({
  selector: '[appRowScrollLock]',
  exportAs: 'rowScrollLock',
})
export class RowScrollLockDirective {
  readonly #row = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #enabled = signal(false);

  /** True while the desktop lock is set up (the page scroll drives the row). */
  readonly enabled = this.#enabled.asReadonly();

  #mm: GsapMatchMedia | null = null;
  #trigger: ScrollTriggerClass | null = null;
  #travel = 0;
  #destroyed = false;

  constructor() {
    if (!this.#isBrowser) return;
    afterNextRender(() => void this.#boot());
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#mm?.revert();
      this.#mm = null;
    });
  }

  /**
   * Arrow buttons. While locked, scroll the page to the card's position so the
   * page and the row stay in step; otherwise scroll the row itself.
   */
  step(direction: 1 | -1): void {
    const trigger = this.#trigger;
    if (trigger && this.#travel > 0 && this.#inRange(trigger)) {
      const target = rowItemTarget(this.#row, direction);
      window.scrollTo({ top: trigger.start + target, behavior: 'smooth' });
      return;
    }
    scrollRowByItem(this.#row, direction);
  }

  async #boot(): Promise<void> {
    try {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (this.#destroyed) return;
      gsap.registerPlugin(ScrollTrigger);
      this.#mm = gsap.matchMedia();
      this.#mm.add(LOCK_QUERY, () => this.#lock(ScrollTrigger));
    } catch {
      // No lock: normal page scroll, arrows and drag still work.
    }
  }

  #inRange(trigger: ScrollTriggerClass): boolean {
    const y = trigger.scroll();
    return y >= trigger.start && y <= trigger.end;
  }

  #lock(ScrollTrigger: ScrollTriggerApi): (() => void) | undefined {
    const row = this.#row;
    const section = row.closest('section');
    const host = section?.parentElement;
    if (!section || !host) return undefined;

    const spacer = document.createElement('div');
    spacer.setAttribute('aria-hidden', 'true');
    host.insertBefore(spacer, section.nextSibling);

    // The page sets the row position frame by frame: no snapping or smoothing on top.
    row.style.scrollSnapType = 'none';
    row.style.scrollBehavior = 'auto';

    let lastSet = -1;
    /** Page position last set from the row (drag, swipe): that update must not move the row back. */
    let rowDrivenY = -1;

    const measure = (): void => {
      const max = row.scrollWidth - row.clientWidth;
      const height = section.offsetHeight;
      const fits = height <= window.innerHeight - STICKY_BAR_PX;
      this.#travel = fits && max > MIN_TRAVEL_PX ? max : 0;
      spacer.style.height = `${this.#travel}px`;
      if (this.#travel > 0) {
        // Stays put from the moment its bottom edge reaches the bottom of the window.
        section.style.position = 'sticky';
        section.style.top = `${window.innerHeight - height}px`;
      } else {
        section.style.position = '';
        section.style.top = '';
      }
    };
    measure();

    const trigger = ScrollTrigger.create({
      trigger: spacer,
      start: 'top bottom',
      end: 'bottom bottom',
      onRefreshInit: measure,
      onUpdate: (self) => {
        if (this.#travel <= 0) return;
        if (Math.abs(self.scroll() - rowDrivenY) < 1) return;
        const target = self.progress * this.#travel;
        const edge = self.progress === 0 || self.progress === 1;
        if (edge || Math.abs(row.scrollLeft - target) > SYNC_TOLERANCE_PX) {
          lastSet = target;
          row.scrollLeft = target;
        }
      },
    });
    this.#trigger = trigger;

    // Drag or a sideways trackpad swipe while locked: move the page to match the row.
    const onRowScroll = (): void => {
      if (this.#travel <= 0 || !this.#inRange(trigger)) return;
      if (Math.abs(row.scrollLeft - lastSet) <= 1) return;
      lastSet = row.scrollLeft;
      rowDrivenY = Math.round(trigger.start + row.scrollLeft);
      window.scrollTo({ top: rowDrivenY, behavior: 'instant' });
    };
    row.addEventListener('scroll', onRowScroll, { passive: true });

    // Cards, photos and sections above can change size after load: recalculate.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => ScrollTrigger.refresh(), REFRESH_DELAY_MS);
    };
    const resizeObserver = new ResizeObserver(scheduleRefresh);
    resizeObserver.observe(document.body);
    resizeObserver.observe(section);
    const mutationObserver = new MutationObserver(scheduleRefresh);
    mutationObserver.observe(row, { childList: true });

    this.#enabled.set(true);

    return () => {
      if (timer) clearTimeout(timer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      row.removeEventListener('scroll', onRowScroll);
      spacer.remove();
      section.style.position = '';
      section.style.top = '';
      row.style.scrollSnapType = '';
      row.style.scrollBehavior = '';
      this.#trigger = null;
      this.#travel = 0;
      this.#enabled.set(false);
    };
  }
}
