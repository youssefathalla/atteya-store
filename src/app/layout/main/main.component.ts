import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { FavoritesGateService } from '@core/services/favorites';
import { ShellReadyService } from '@core/services/shell/shell-ready.service';
import { useBreakpoint } from '@shared/utils/breakpoint.utils';
import { LoaderComponent } from '@shared/ui/loader/loader.component';
import { DesktopNavComponent } from '../navbar/desktop-nav/desktop-nav.component';
import { MobileNavComponent } from '../navbar/mobile-nav/mobile-nav.component';
import { CartDrawerComponent } from '../cart-drawer/cart-drawer.component';
import { ShippingBannerComponent } from '@shared/components/shipping-banner/shipping-banner.component';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { LogoComponent } from '@shared/ui/logo/logo.component';
import { FooterComponent } from '../footer/footer.component';
import { chromeModeOf } from './chrome-mode';

/** Fallback when chrome is not mounted yet (desktop nav h-14). */
const DEFAULT_TOP_CHROME_PX = 56;

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    DesktopNavComponent,
    CartDrawerComponent,
    MobileNavComponent,
    ShippingBannerComponent,
    LoaderComponent,
    LogoComponent,
    FooterComponent,
  ],
  templateUrl: './main.component.html',
})
export class MainLayoutComponent {
  readonly drawerService = inject(DrawerService);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #shell = inject(ShellReadyService);
  readonly navigating = signal(false);
  readonly #initialShellDone = signal(false);

  readonly chromeReady = this.#shell.chromeReady;
  /**
   * Single-task pages (route `data: FOCUS_CHROME`: Sign in, Checkout) show only the logo bar.
   * The router state is already the target one while this layout is created, so the first
   * paint (server and browser) uses the right chrome.
   */
  readonly focusChrome = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => chromeModeOf(this.#router.routerState.snapshot.root) === 'focus'),
    ),
    { initialValue: chromeModeOf(this.#router.routerState.snapshot.root) === 'focus' },
  );
  /** Focus pages don't use the navigation or banner, so they never wait for them. */
  readonly showInitialShellLoader = computed(
    () =>
      isPlatformBrowser(this.#platformId) &&
      !this.focusChrome() &&
      !this.#initialShellDone() &&
      !this.chromeReady(),
  );

  /** Shipping banner host — contributes to `--storefront-top-chrome`. */
  readonly shippingChrome = viewChild('shippingChrome', {
    read: ElementRef<HTMLElement>,
  });
  /** Desktop nav host — contributes to `--storefront-top-chrome` (0 when `lg:hidden`). */
  readonly navChrome = viewChild('navChrome', { read: ElementRef<HTMLElement> });

  // Responsive signal to differentiate desktop side drawer vs mobile bottom slide-up
  readonly isDesktop = useBreakpoint(1024);

  constructor() {
    // Eager: applies a pending favorite after guest heart → sign-in.
    inject(FavoritesGateService);

    effect(() => {
      if (this.chromeReady()) {
        this.#initialShellDone.set(true);
      }
    });

    if (!isPlatformBrowser(this.#platformId)) {
      return;
    }

    afterNextRender(() => {
      this.#syncTopChromeHeight();
    });

    afterRenderEffect((onCleanup) => {
      const shipping = this.shippingChrome()?.nativeElement;
      const nav = this.navChrome()?.nativeElement;
      if (!shipping && !nav) {
        this.#setTopChromeHeight(DEFAULT_TOP_CHROME_PX);
        return;
      }
      this.#syncTopChromeHeight();
      const ro =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.#syncTopChromeHeight()) : null;
      if (shipping) ro?.observe(shipping);
      if (nav) ro?.observe(nav);
      onCleanup(() => ro?.disconnect());
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    this.#destroyRef.onDestroy(() => {
      if (timer) clearTimeout(timer);
      this.#setTopChromeHeight(DEFAULT_TOP_CHROME_PX);
    });

    this.#router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => this.navigating.set(true), 150);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        if (timer) clearTimeout(timer);
        timer = null;
        this.navigating.set(false);
      }
    });
  }

  #syncTopChromeHeight(): void {
    const shipping = this.shippingChrome()?.nativeElement;
    const nav = this.navChrome()?.nativeElement;
    const height =
      Math.ceil(shipping?.getBoundingClientRect().height ?? 0) +
      Math.ceil(nav?.getBoundingClientRect().height ?? 0);
    this.#setTopChromeHeight(height > 0 ? height : DEFAULT_TOP_CHROME_PX);
  }

  #setTopChromeHeight(px: number): void {
    document.documentElement.style.setProperty('--storefront-top-chrome', `${px}px`);
  }
}
