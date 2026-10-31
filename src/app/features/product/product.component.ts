import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  PLATFORM_ID,
  resource,
  signal,
  type OnInit,
} from '@angular/core';
import { DOCUMENT, isPlatformServer } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { injectFirestore } from '@core/firebase';
import { buildPdpGalleryLcpUrl } from '@core/image/image-kit.loader';
import { AuthService } from '@core/services/auth/auth.service';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { FavoritesGateService, FavoritesService } from '@core/services/favorites';
import { displayPrice, type Offer, priceItem } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { fromTransferOffer } from '@core/services/offers/offer-transfer';
import { OffersService } from '@core/services/offers/offers.service';
import { PublicOffersReader } from '@core/services/offers/public-offers.reader';
import { CatalogService, type Product, toVariantFacts } from '@core/services/products';
import { SeoService } from '@core/services/seo';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { AddToBagButtonComponent } from './components/add-to-bag-button/add-to-bag-button.component';
import { ProductGalleryComponent } from './components/product-gallery/product-gallery.component';
import { ProductOptionsComponent } from './components/product-options/product-options.component';
import { ProductSiblingsComponent } from './components/product-siblings/product-siblings.component';
import type { OptionSelection, ProductPageResult, ProductView } from './models/product-page.model';
import { watchProductDoc } from './utils/product-live';
import {
  findVariant,
  initialSelection,
  isProductInStock,
  stockMode,
} from './utils/product-stock.utils';

@Component({
  selector: 'app-product',
  imports: [
    RouterLink,
    MatButtonModule,
    SharedIconModule,
    ProductPriceComponent,
    ProductGalleryComponent,
    ProductOptionsComponent,
    ProductSiblingsComponent,
    AddToBagButtonComponent,
  ],
  templateUrl: './product.component.html',
  host: { class: 'block w-full' },
})
export class ProductComponent implements OnInit {
  readonly page = input.required<ProductPageResult>();

  readonly #seo = inject(SeoService);
  readonly #catalog = inject(CatalogService);
  readonly #offersReader = inject(PublicOffersReader);
  readonly #liveOffers = inject(OffersService);
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #favorites = inject(FavoritesService);
  readonly #favoritesGate = inject(FavoritesGateService);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);
  readonly #document = inject(DOCUMENT);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #shippingSettings = inject(ShippingSettingsService);

  readonly shippingLine = this.#shippingSettings.shippingLine;

  /** False until the first browser render so hydration matches server pricing. */
  readonly #hydrated = signal(false);
  /** Latest server copy of the open product. id guards against a late snapshot for the previous page. */
  readonly #live = signal<{ readonly id: string; readonly doc: Product | null } | null>(null);
  /** Pricing clock: starts at server render time, then switches to browser time ticking every 60 s. */
  readonly #nowMs = linkedSignal(() => {
    const p = this.page();
    return p.status === 'found' ? p.renderedAtMs : Date.now();
  });

  /** Fallback only when the server offers read failed (offers === null). Browser-only after hydration. */
  readonly #fallbackOffers = resource({
    params: () => {
      const p = this.page();
      return this.#hydrated() && p.status === 'found' && p.offers === null
        ? p.product.id
        : undefined;
    },
    loader: () => this.#offersReader.fetchActivePublic(),
  });

  readonly #offers = computed<readonly Offer[]>(() => {
    const p = this.page();
    if (p.status !== 'found') return [];
    // After hydration, prefer the realtime listener (same pattern as search cards).
    if (this.#hydrated() && this.#liveOffers.ready() && !this.#liveOffers.failed()) {
      return this.#liveOffers.all();
    }
    if (p.offers) return p.offers.map(fromTransferOffer);
    return this.#fallbackOffers.hasValue() ? this.#fallbackOffers.value() : [];
  });

  readonly product = computed<ProductView | null>(
    () => {
      const p = this.page();
      if (p.status !== 'found') return null;
      const live = this.#live();
      if (live?.id !== p.product.id || !live.doc) return p.product;
      const d = live.doc;
      // Only price and stock go live. Images, options and text stay as rendered (no gallery or picks reset).
      return {
        ...p.product,
        price: d.price,
        compareAtPrice: d.compareAtPrice,
        trackStock: d.trackStock,
        stock: d.stock,
        stockBySize: d.stockBySize,
        inStock: d.inStock,
        variants: d.variants,
      };
    },
    // Same values = same object, so a snapshot that changes nothing re-renders nothing.
    { equal: (a, b) => a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b)) },
  );

  /** Unpublished or deleted while the page is open. */
  readonly removed = computed(() => {
    const p = this.page();
    const live = this.#live();
    return p.status === 'found' && live?.id === p.product.id && live.doc === null;
  });

  readonly inStock = computed(() => {
    const p = this.product();
    return !!p && !this.removed() && isProductInStock(p);
  });

  readonly selection = linkedSignal<ProductView | null, OptionSelection>({
    source: this.product,
    computation: (p, previous) => {
      if (!p) return {};
      if (previous?.source?.id === p.id) return previous.value;
      return initialSelection(p);
    },
  });

  readonly variant = computed(() => {
    const p = this.product();
    return p ? findVariant(p, this.selection()) : null;
  });

  readonly colourImage = computed(() => {
    const p = this.product();
    const id = this.selection()['colour'];
    return (
      p?.options
        .find((option) => option.key === 'colour')
        ?.values.find((val) => val.id === id)?.image ?? null
    );
  });

  readonly brandName = computed(() => {
    const p = this.product();
    return p ? (this.#catalog.brandBySlug(p.brandId)?.name ?? p.brandId) : '';
  });

  readonly breadcrumbs = computed(() =>
    (this.product()?.categoryIds ?? []).flatMap((id) => {
      const category = this.#catalog.categoryBySlug(id);
      return category ? [{ label: category.name, link: ['/category', id] as const }] : [];
    }),
  );

  readonly price = computed(() => {
    const p = this.product();
    if (!p) return null;
    const priced = toPricedProduct(p);
    const hydrated = this.#hydrated();
    const ctx = { now: new Date(this.#nowMs()), signedIn: hydrated && Boolean(this.#auth.user()) };
    const offers = this.#offers();
    const v = this.variant();
    if (v) {
      const r = priceItem(priced, toVariantFacts(p, v), offers, ctx);
      return {
        price: r.effectivePrice,
        fromPrice: null,
        listPrice: r.listPrice,
        partial: false,
        badges: r.badges.map((badge) => badge.text),
      };
    }
    const d = displayPrice(priced, offers, ctx);
    return {
      price: d.partial ? p.price : d.fromPrice,
      fromPrice: d.partial ? d.fromPrice : null,
      listPrice: d.listPrice,
      partial: d.partial,
      badges: d.badges.map((b) => b.text),
    };
  });

  readonly isFavorite = computed(() => {
    const p = this.product();
    if (!p || !this.#auth.isAuthReady() || !this.#auth.isAuthenticated()) return false;
    if (!this.#favorites.ready()) return false;
    return this.#favorites.has(p.id);
  });

  readonly favoriteBusy = computed(() => {
    const p = this.product();
    if (!p) return true;
    if (this.#favorites.isPending(p.id)) return true;
    if (this.#auth.isAuthenticated() && !this.#favorites.ready()) return true;
    return false;
  });

  readonly favoriteLabel = computed(() =>
    this.isFavorite() ? 'Remove from favorites' : 'Add to favorites',
  );

  readonly cartLine = computed<CartLineDraft | null>(() => {
    const p = this.product();
    const sel = this.selection();
    const v = this.variant();
    if (!p || !this.inStock()) return null;
    if (p.options.some((option) => !sel[option.key])) return null;
    if (typeof p.stock === 'number') {
      if (
        p.stockBySize &&
        p.options.some((option) => option.key === 'size') &&
        (p.stockBySize[sel['size']] ?? 0) <= 0
      ) {
        return null;
      }
    } else if (stockMode(p) === 'variants' && (!v || v.stock <= 0)) {
      // legacy until PR 1b
      return null;
    }
    return { productId: p.id, variantId: v?.id ?? null, selection: sel, quantity: 1 };
  });

  constructor() {
    afterNextRender(() => {
      this.#hydrated.set(true);
      this.#nowMs.set(Date.now());
      const id = setInterval(() => this.#nowMs.set(Date.now()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(id));
    });

    effect((onCleanup) => {
      const page = this.page();
      if (!this.#hydrated() || page.status !== 'found') return;
      const id = page.product.id;
      this.#live.set(null); // drop any older snapshot (e.g. A → B → back to A)
      const stop = watchProductDoc(this.#firestore, id, (doc) => this.#live.set({ id, doc }));
      onCleanup(stop);
    });

    effect(() => {
      const page = this.page();
      if (page.status === 'found') {
        const p = page.product;
        const brand = this.brandName();
        this.#seo.setPageMetadata({
          title: `${p.name} | Atteya Store`,
          description:
            p.summary?.trim() || `${p.name}${brand ? ` by ${brand}` : ''}. Shop at Atteya Store.`,
          noindex: !isProductInStock(p),
        });
      } else {
        this.#seo.setPageMetadata({
          title:
            page.status === 'missing' ? 'Product not found | Atteya Store' : 'Product | Atteya Store',
          description: 'This product is not available.',
          noindex: true,
        });
      }
    });
  }

  ngOnInit(): void {
    this.#preloadGalleryLcpImage();
  }

  select(key: string, valueId: string): void {
    this.selection.update((current) => ({ ...current, [key]: valueId }));
  }

  onFavoriteClick(): void {
    const p = this.product();
    if (!p) return;
    void this.#favoritesGate.onFavoriteClick(p.id, p.slug);
  }

  retry(): void {
    void this.#router.navigateByUrl(this.#router.url, { onSameUrlNavigation: 'reload' });
  }

  /** SSR-only: start ImageKit fetch before the gallery `<img priority>` is parsed. */
  #preloadGalleryLcpImage(): void {
    if (!isPlatformServer(this.#platformId)) return;
    const page = this.page();
    if (page.status !== 'found') return;
    const lcpImage = this.colourImage() ?? page.product.images[0];
    const path = lcpImage?.path;
    if (!path) return;

    const href = buildPdpGalleryLcpUrl(path);
    if (!href) return;

    const head = this.#document.head;
    if (head.querySelector(`link[rel="preload"][as="image"][href="${href}"]`)) return;

    const link = this.#document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.setAttribute('fetchpriority', 'high');
    link.href = href;
    head.appendChild(link);
  }
}
