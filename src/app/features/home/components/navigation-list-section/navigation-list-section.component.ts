import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser, NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LinkTargetPipe } from '@shared/pipes/link-target.pipe';
import type { gsap as GsapNamespace } from 'gsap';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { normalizeImageKitPath } from '@shared/utils/image';
import { CatalogService } from '@core/services/products/catalog.service';
import { NAV_LIST_MAX_ITEMS } from '../../data/home.data';
import { HomeNavList, HomeNavListItem } from '../../models/home.model';
import {
  pendingNavListImage,
  playNavListArrows,
  playNavListSwap,
  settleNavListArrows,
  settleNavListPhotos,
} from '../../utils/navigation-list-motion';

type GsapApi = typeof GsapNamespace;
type GsapContext = ReturnType<GsapApi['context']>;

/** Longest wait for an incoming photo before the swap plays anyway. */
const PHOTO_WAIT_MS = 1200;

let nextTitleId = 0;

@Component({
  selector: 'app-navigation-list-section',
  host: {
    class: 'block w-full',
  },
  templateUrl: './navigation-list-section.component.html',
  styleUrl: './navigation-list-section.component.scss',
  imports: [
    RouterLink,
    LinkTargetPipe,
    NgOptimizedImage,
    NgTemplateOutlet,
    AppImageFallbackDirective,
    SkeletonComponent,
    SharedIconModule,
  ],
})
export class NavigationListSectionComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #catalog = inject(CatalogService);
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly navList = input.required<HomeNavList>();
  readonly isLoading = input<boolean>(false);
  readonly previewMode = input<boolean>(false);
  readonly activeItemIndex = input<number>(0);

  readonly itemSelect = output<number>();

  readonly titleId = `nav-list-title-${++nextTitleId}`;

  /**
   * The saved list as staff entered it (admin preview), or for shoppers the same
   * list without links to a category or brand that has nothing published. The
   * check is the one the menus use (`CatalogService.isEmpty`), which keeps every
   * link while the catalogue counts are missing or still loading.
   */
  readonly items = computed(() => {
    const saved = this.navList().items.slice(0, NAV_LIST_MAX_ITEMS);
    if (this.previewMode()) return saved;
    return saved.filter((item) => !this.#catalog.isEmpty(item.link));
  });
  readonly title = computed(() => this.navList().title.trim() || 'Shop by category');

  readonly #activeIndex = linkedSignal<number | null, number>({
    source: () => (this.previewMode() ? this.#clamp(this.activeItemIndex()) : null),
    computation: (edited, previous) => {
      if (edited !== null) return edited;
      return this.#clamp(previous?.value ?? 0);
    },
  });

  readonly activeIndex = computed(() => this.#clamp(this.#activeIndex()));

  /** Item 0 mounts with the desktop panel. The rest mount on the first pointer or focus. */
  readonly #mounted = signal<ReadonlySet<number>>(new Set([0]));
  /**
   * Stays false until the browser confirms the lg layout. Starting false keeps
   * the photo out of the server HTML and the first client render, so a phone
   * never requests it before the layout is known.
   */
  readonly #desktopPhotos = signal(false);
  readonly #motionReady = signal(false);

  readonly showPhotos = this.#desktopPhotos.asReadonly();

  #gsap: GsapApi | null = null;
  #ctx: GsapContext | null = null;
  #desktopQuery: MediaQueryList | null = null;
  #reduceQuery: MediaQueryList | null = null;
  #reduceMotion = false;
  #destroyed = false;
  #lastAnimated = -1;
  #animatedPhotoCount = 0;
  #lastArrow = -1;
  #cancelPhotoWait: (() => void) | null = null;

  constructor() {
    afterNextRender(() => this.#bootBrowser());

    afterRenderEffect(() => {
      const index = this.activeIndex();
      const ready = this.#motionReady();
      const photosEnabled = this.#desktopPhotos();
      const mounted = this.#mounted();
      if (!ready || !photosEnabled || !mounted.has(index)) return;
      untracked(() => this.#syncPhotos(index));
    });

    // The arrow follows the active row straight away, even while the photo
    // waits for its download.
    afterRenderEffect(() => {
      const index = this.activeIndex();
      const ready = this.#motionReady();
      const desktop = this.#desktopPhotos();
      this.items();
      if (!ready || !desktop) return;
      untracked(() => this.#syncArrows(index));
    });

    inject(DestroyRef).onDestroy(() => this.#teardown());
  }

  imagePath(item: HomeNavListItem): string | null {
    const path = normalizeImageKitPath(item.imageUrl);
    if (!path || path === 'hero/default-hero.jpg') return null;
    return path;
  }

  isMounted(index: number): boolean {
    return this.#mounted().has(index);
  }

  isEdited(index: number): boolean {
    return this.previewMode() && this.activeItemIndex() === index;
  }

  mountRemaining(): void {
    if (!this.#desktopPhotos()) return;
    const count = this.items().length;
    this.#mounted.update((current) => {
      if (current.size >= count) return current;
      return new Set(Array.from({ length: count }, (_, index) => index));
    });
  }

  activate(index: number): void {
    const next = this.#clamp(index);
    if (this.#desktopPhotos()) this.#mount(next);
    if (this.#activeIndex() === next) return;
    this.#activeIndex.set(next);
  }

  selectItem(index: number): void {
    this.activate(index);
    this.itemSelect.emit(index);
  }

  #mount(index: number): void {
    this.#mounted.update((current) => {
      if (current.has(index)) return current;
      const next = new Set(current);
      next.add(index);
      return next;
    });
  }

  #clamp(index: number): number {
    const count = this.items().length;
    if (count <= 0) return 0;
    if (index < 0) return 0;
    if (index >= count) return count - 1;
    return index;
  }

  #bootBrowser(): void {
    const desktop = window.matchMedia('(min-width: 1024px)');
    this.#desktopPhotos.set(desktop.matches);
    desktop.addEventListener('change', this.#onDesktopChange);
    this.#desktopQuery = desktop;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.#reduceMotion = reduce.matches;
    reduce.addEventListener('change', this.#onReduceChange);
    this.#reduceQuery = reduce;

    void import('gsap')
      .then(({ gsap }) => {
        if (this.#destroyed) return;
        this.#gsap = gsap;
        this.#ctx = gsap.context(() => undefined, this.#host.nativeElement);
        this.#motionReady.set(true);
      })
      .catch(() => {
        // CSS keeps the first photo visible when animation cannot start.
      });
  }

  readonly #onDesktopChange = (event: MediaQueryListEvent): void => {
    this.#desktopPhotos.set(event.matches);
    if (event.matches) return;
    this.#stopPhotoWait();
    this.#lastAnimated = -1;
    this.#animatedPhotoCount = 0;
    this.#lastArrow = -1;
    this.#ctx?.revert();
    if (this.#gsap) {
      this.#ctx = this.#gsap.context(() => undefined, this.#host.nativeElement);
    }
  };

  readonly #onReduceChange = (event: MediaQueryListEvent): void => {
    this.#reduceMotion = event.matches;
    if (!event.matches) return;
    this.#lastAnimated = -1;
    this.#animatedPhotoCount = 0;
    this.#lastArrow = -1;
    this.#syncPhotos(this.activeIndex());
    this.#syncArrows(this.activeIndex());
  };

  #syncArrows(index: number): void {
    const gsap = this.#gsap;
    const ctx = this.#ctx;
    if (!gsap || !ctx || !this.#desktopPhotos()) return;

    const arrows = [...this.#host.nativeElement.querySelectorAll<HTMLElement>('[data-nav-arrow]')];
    if (arrows.length === 0) return;

    const first = this.#lastArrow < 0;
    if (!first && this.#lastArrow === index) {
      // Same row, but the list may have new rows (admin preview edits).
      ctx.add(() => settleNavListArrows(gsap, arrows, index));
      return;
    }
    this.#lastArrow = index;
    ctx.add(() => {
      if (first) {
        settleNavListArrows(gsap, arrows, index);
        return;
      }
      playNavListArrows(gsap, arrows, index, this.#reduceMotion);
    });
  }

  #syncPhotos(index: number, skipWait = false): void {
    const gsap = this.#gsap;
    const ctx = this.#ctx;
    if (!gsap || !ctx || !this.#desktopPhotos()) return;

    const photos = [...this.#host.nativeElement.querySelectorAll<HTMLElement>('[data-nav-photo]')];
    if (photos.length === 0) return;
    if (this.#lastAnimated === index && this.#animatedPhotoCount === photos.length) return;

    this.#stopPhotoWait();
    const first = this.#lastAnimated < 0;
    const indexChanged = this.#lastAnimated !== index;

    // Keep the current photo on screen until the next one has downloaded,
    // so the change never fades through an empty frame.
    if (!first && indexChanged && !skipWait) {
      const pending = pendingNavListImage(photos, index);
      if (pending) {
        // The `is-active` class would show its loading shimmer on top meanwhile.
        const incoming = pending.closest<HTMLElement>('[data-nav-photo]');
        if (incoming) ctx.add(() => gsap.set(incoming, { opacity: 0, overwrite: 'auto' }));
        this.#waitForPhoto(pending, index);
        return;
      }
    }

    this.#lastAnimated = index;
    this.#animatedPhotoCount = photos.length;

    ctx.add(() => {
      if (first || !indexChanged) {
        settleNavListPhotos(gsap, photos, index);
        return;
      }
      playNavListSwap(gsap, photos, index, this.#reduceMotion);
    });
  }

  #waitForPhoto(img: HTMLImageElement, index: number): void {
    const play = (): void => {
      this.#stopPhotoWait();
      if (this.#destroyed || this.activeIndex() !== index) return;
      this.#syncPhotos(index, true);
    };
    // After an ImageKit error the fallback directive (its listener runs
    // first) retries the Storage URL on the same <img>, so `complete` is
    // false again and we keep waiting. A second error leaves it complete:
    // the photo has finally failed, so swap now. The timer covers a photo
    // that never arrives.
    const onError = (): void => {
      if (img.complete) play();
    };
    img.addEventListener('load', play);
    img.addEventListener('error', onError);
    const timer = setTimeout(play, PHOTO_WAIT_MS);
    this.#cancelPhotoWait = () => {
      img.removeEventListener('load', play);
      img.removeEventListener('error', onError);
      clearTimeout(timer);
    };
  }

  #stopPhotoWait(): void {
    this.#cancelPhotoWait?.();
    this.#cancelPhotoWait = null;
  }

  #teardown(): void {
    this.#stopPhotoWait();
    this.#destroyed = true;
    this.#desktopQuery?.removeEventListener('change', this.#onDesktopChange);
    this.#reduceQuery?.removeEventListener('change', this.#onReduceChange);
    this.#ctx?.revert();
    this.#ctx = null;
  }
}
