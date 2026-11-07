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
import { NAV_LIST_MAX_ITEMS } from '../../data/home.data';
import { HomeNavList, HomeNavListItem } from '../../models/home.model';
import {
  playNavListSwap,
  settleNavListPhotos,
} from '../../utils/navigation-list-motion';

type GsapApi = typeof GsapNamespace;
type GsapContext = ReturnType<GsapApi['context']>;

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
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly navList = input.required<HomeNavList>();
  readonly isLoading = input<boolean>(false);
  readonly previewMode = input<boolean>(false);
  readonly activeItemIndex = input<number>(0);

  readonly itemSelect = output<number>();

  readonly titleId = `nav-list-title-${++nextTitleId}`;

  readonly items = computed(() => this.navList().items.slice(0, NAV_LIST_MAX_ITEMS));
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
    const count = this.navList().items.length;
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
    this.#lastAnimated = -1;
    this.#animatedPhotoCount = 0;
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
    this.#syncPhotos(this.activeIndex());
  };

  #syncPhotos(index: number): void {
    const gsap = this.#gsap;
    const ctx = this.#ctx;
    if (!gsap || !ctx || !this.#desktopPhotos()) return;

    const photos = [
      ...this.#host.nativeElement.querySelectorAll<HTMLElement>('[data-nav-photo]'),
    ];
    if (photos.length === 0) return;
    if (this.#lastAnimated === index && this.#animatedPhotoCount === photos.length) return;

    const first = this.#lastAnimated < 0;
    const indexChanged = this.#lastAnimated !== index;
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

  #teardown(): void {
    this.#destroyed = true;
    this.#desktopQuery?.removeEventListener('change', this.#onDesktopChange);
    this.#reduceQuery?.removeEventListener('change', this.#onReduceChange);
    this.#ctx?.revert();
    this.#ctx = null;
  }
}
