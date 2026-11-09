import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { CurrencyService } from '@core/services/currency/currency.service';
import { FavoritesGateService, FavoritesService } from '@core/services/favorites';
import {
  displayPrice,
  giftChoiceIds,
  giftOfferForProduct,
  liveOffers,
  matchProduct,
  type Offer,
  type OfferBadge,
  priceItem,
} from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { fromTransferOffer } from '@core/services/offers/offer-transfer';
import { OffersService } from '@core/services/offers/offers.service';
import { PublicOffersReader } from '@core/services/offers/public-offers.reader';
import {
  CatalogService,
  COLOR_PALETTE,
  marketingBadgeLabel,
  PlayerListService,
  type Product,
  productDetailsTitle,
  ProductService,
  toVariantFacts,
} from '@core/services/products';
import { SeoService } from '@core/services/seo';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { formatMoney } from '@shared/utils/money';
import { AddToBagButtonComponent } from './components/add-to-bag-button/add-to-bag-button.component';
import { ProductGalleryComponent } from './components/product-gallery/product-gallery.component';
import { ProductGiftBoxComponent } from './components/product-gift-box/product-gift-box.component';
import { ProductOptionsComponent } from './components/product-options/product-options.component';
import { ProductSiblingsComponent } from './components/product-siblings/product-siblings.component';
import type {
  ChoicePrompt,
  OptionSelection,
  ProductPageResult,
  ProductView,
} from './models/product-page.model';
import {
  buildGiftBox,
  cartLineGifts,
  effectiveGiftPicks,
  giftChoiceFacts,
  type GiftBoxView,
  type GiftPicks,
  giftSizeStepKey,
  giftStepKey,
  missingGiftPrompt,
  toGiftChoice,
} from './utils/product-gifts';
import { watchProductDoc } from './utils/product-live';
import {
  findVariant,
  initialSelection,
  isProductInStock,
  isValueAvailable,
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
    ProductGiftBoxComponent,
    SkeletonComponent,
    AddToBagButtonComponent,
  ],
  templateUrl: './product.component.html',
  host: { class: 'block w-full' },
})
export class ProductComponent {
  readonly page = input.required<ProductPageResult>();

  readonly #seo = inject(SeoService);
  readonly #catalog = inject(CatalogService);
  readonly #playerList = inject(PlayerListService);
  readonly #offersReader = inject(PublicOffersReader);
  readonly #liveOffers = inject(OffersService);
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #favorites = inject(FavoritesService);
  readonly #favoritesGate = inject(FavoritesGateService);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);
  readonly #shippingSettings = inject(ShippingSettingsService);
  readonly #currency = inject(CurrencyService);
  readonly #products = inject(ProductService);

  /**
   * Shipping section lines. Null = visitor pays in another currency (worked out at checkout).
   * Empty = settings not loaded or missing.
   */
  readonly shippingNotes = computed<readonly string[] | null>(() => {
    if (this.#currency.selected() !== 'EGP') return null;
    const settings = this.#shippingSettings.settings();
    const from = this.#shippingSettings.fromFee();
    if (!settings || from === null) return [];
    const lines = [`Delivery in Egypt from ${formatMoney(from, 'EGP', 0)}.`];
    if (settings.freeOver.active && settings.freeOver.threshold !== null) {
      lines.push(`Free delivery on orders over ${formatMoney(settings.freeOver.threshold, 'EGP', 0)}.`);
    }
    if (this.#shippingSettings.promoLive() && settings.promo.banner) lines.push(settings.promo.banner);
    if (settings.note) lines.push(settings.note);
    return lines;
  });

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
      return this.#hydrated() && p.status === 'found' && p.offers === null ? p.product.id : undefined;
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
      p?.options.find((option) => option.key === 'colour')?.values.find((val) => val.id === id)?.image ?? null
    );
  });

  readonly brandName = computed(() => {
    const p = this.product();
    return p ? (this.#catalog.brandBySlug(p.brandId)?.name ?? p.brandId) : '';
  });

  /** "More from <player>" links to Shop filtered by that player; players no longer in the list are skipped. */
  readonly playerLinks = computed(() =>
    (this.product()?.players ?? []).flatMap((id) => {
      const name = this.#playerList.nameOf(id);
      return name ? [{ id, name, query: { player: id } }] : [];
    }),
  );

  readonly breadcrumbs = computed(() => [
    { label: 'Shop', link: ['/shop'] as readonly string[] },
    ...(this.product()?.categoryIds ?? []).flatMap((id) => {
      const category = this.#catalog.categoryBySlug(id);
      return category ? [{ label: category.name, link: ['/category', id] as readonly string[] }] : [];
    }),
  ]);

  /** Section title for `details`: Materials for clothing, socks and supports, Specifications for gear. */
  readonly detailsTitle = computed(() => productDetailsTitle(this.product()?.categoryIds ?? []));

  /** Description with real words in it (some imported products only have `<p></p>`). */
  readonly hasDescription = computed(() => {
    const html = this.product()?.descriptionHtml ?? '';
    return (
      html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim().length > 0
    );
  });

  readonly badgeLabel = computed(() => {
    const badge = this.product()?.marketingBadge;
    return badge ? marketingBadgeLabel(badge.kind) : '';
  });

  /** Line above the other-colour photos. A product with its own colour choice already names it there. */
  readonly coloursLabel = computed(() => {
    const p = this.product();
    if (!p) return '';
    if (p.options.some((option) => option.key === 'colour')) return 'More Colours';
    const names = (p.colors ?? []).flatMap((id) => {
      const entry = COLOR_PALETTE.find((color) => color.id === id);
      return entry ? [entry.label] : [];
    });
    return names.length > 0 ? `Colour: ${names.join(' / ')}` : 'Colours';
  });

  /** What to ask for after Add to Bag was pressed too early. Cleared for every new product. */
  readonly choicePrompt = linkedSignal<string | undefined, ChoicePrompt | null>({
    source: () => this.product()?.id,
    computation: () => null,
  });

  /** Offer clock and sign-in state shared by the price and the Gift Box. */
  readonly #pricingCtx = computed(() => ({
    now: new Date(this.#nowMs()),
    signedIn: this.#hydrated() && Boolean(this.#auth.user()),
  }));

  readonly price = computed(() => {
    const p = this.product();
    if (!p) return null;
    const priced = toPricedProduct(p);
    const ctx = this.#pricingCtx();
    const offers = this.#offers();
    const v = this.variant();
    if (v) {
      const r = priceItem(priced, toVariantFacts(p, v), offers, ctx);
      return {
        price: r.effectivePrice,
        fromPrice: null,
        listPrice: r.listPrice,
        partial: false,
        ...this.#splitBadges(r.badges, offers),
      };
    }
    const d = displayPrice(priced, offers, ctx);
    return {
      price: d.partial ? p.price : d.fromPrice,
      fromPrice: d.partial ? d.fromPrice : null,
      listPrice: d.listPrice,
      partial: d.partial,
      ...this.#splitBadges(d.badges, offers),
    };
  });

  /**
   * One design per offer type. Price offers (percent off, amount off, fixed price) stay badges
   * next to the price. Buy X get Y, tiered and free shipping become one short line with the
   * offer's title. Free gift offers show as the Gift Box, never as a badge.
   */
  #splitBadges(
    badges: readonly OfferBadge[],
    offers: readonly Offer[],
  ): { badges: string[]; offerLines: string[] } {
    const shown: string[] = [];
    const lines: string[] = [];
    // An amount in EGP means nothing to a visitor paying in another currency.
    const hideEgp = this.#currency.selected() !== 'EGP';
    for (const badge of badges) {
      const kind = badge.labelOnly
        ? offers.find((offer) => offer.id === badge.offerId)?.reward.kind
        : undefined;
      if (kind === 'freeGift') continue;
      if (kind === 'buyXGetY' || kind === 'tiered' || kind === 'freeShipping') {
        const title = offers.find((offer) => offer.id === badge.offerId)?.title.trim() || badge.text;
        if (!lines.includes(title) && !(hideEgp && /\bEGP\b/.test(title))) lines.push(title);
        continue;
      }
      shown.push(badge.text);
    }
    return { badges: shown, offerLines: lines };
  }

  /**
   * Products the Free gift offers on this product can give, sorted. Known on the server too
   * (offers come with the page), so the Gift Box space is kept from the first paint.
   */
  readonly #giftChoiceIds = computed(
    () => {
      const p = this.product();
      if (!p || !this.inStock()) return [];
      const facts = toPricedProduct(p);
      const candidates = liveOffers(this.#offers(), this.#pricingCtx()).filter(
        (offer) =>
          offer.reward.kind === 'freeGift' &&
          offer.scope === 'item' &&
          matchProduct(offer.conditions, offer.exclude, facts) !== 'none',
      );
      return giftChoiceIds(candidates).sort();
    },
    { equal: (a, b) => a.length === b.length && a.every((id, index) => id === b[index]) },
  );

  /** The gift products, read in the browser once the page is up. Unavailable ones come back null. */
  readonly #giftChoices = resource({
    params: () => {
      const ids = this.#giftChoiceIds();
      return this.#hydrated() && ids.length > 0 ? ids : undefined;
    },
    loader: async ({ params: ids }) => {
      const products = await Promise.all(ids.map((id) => this.#products.getById(id)));
      return products.flatMap((product) => {
        const choice = product ? toGiftChoice(product) : null;
        return choice ? [choice] : [];
      });
    },
  });

  /** Space for the Gift Box while its gift products load (server render included). */
  readonly giftBoxLoading = computed(
    () => this.#giftChoiceIds().length > 0 && !this.#giftChoices.hasValue() && !this.#giftChoices.error(),
  );

  /** The Gift Box for this product (and its chosen colour and size), or null. */
  readonly giftBox = computed<GiftBoxView | null>(() => {
    const p = this.product();
    if (!p || !this.inStock() || this.#giftChoiceIds().length === 0) return null;
    if (!this.#giftChoices.hasValue()) return null;
    const choices = this.#giftChoices.value();
    const v = this.variant();
    const offer = giftOfferForProduct(
      toPricedProduct(p),
      v ? toVariantFacts(p, v) : null,
      this.#offers(),
      this.#pricingCtx(),
      giftChoiceFacts(choices),
    );
    return offer ? buildGiftBox(offer, choices, p.type) : null;
  });

  /** What the shopper tapped in the Gift Box. Cleared for every new product. */
  readonly #giftPicks = linkedSignal<string | undefined, GiftPicks>({
    source: () => this.product()?.id,
    computation: () => ({}),
  });

  /** The picks that still hold for the current Gift Box (plus gifts with only one choice). */
  readonly giftPicks = computed<GiftPicks>(() => {
    const box = this.giftBox();
    return box ? effectiveGiftPicks(box, this.#giftPicks()) : {};
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

  readonly favoriteLabel = computed(() => (this.isFavorite() ? 'Remove from favorites' : 'Add to favorites'));

  readonly cartLine = computed<CartLineDraft | null>(() => {
    const p = this.product();
    const sel = this.selection();
    const v = this.variant();
    if (!p || !this.inStock()) return null;
    if (p.options.some((option) => !sel[option.key])) return null;
    if (
      p.stockBySize &&
      p.options.some((option) => option.key === 'size') &&
      (p.stockBySize[sel['size']] ?? 0) <= 0
    ) {
      return null;
    }
    if (this.giftBoxLoading()) return null;
    const box = this.giftBox();
    if (!box) return { productId: p.id, variantId: v?.id ?? null, selection: sel, quantity: 1 };
    const gifts = cartLineGifts(box, this.giftPicks());
    if (!gifts) return null;
    return { productId: p.id, variantId: v?.id ?? null, selection: sel, quantity: 1, gifts };
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
          description: p.summary?.trim() || `${p.name}${brand ? ` by ${brand}` : ''}. Shop at Atteya Store.`,
          noindex: !isProductInStock(p),
        });
      } else {
        this.#seo.setPageMetadata({
          title: page.status === 'missing' ? 'Product not found | Atteya Store' : 'Product | Atteya Store',
          description: 'This product is not available.',
          noindex: true,
        });
      }
    });
  }

  select(key: string, valueId: string): void {
    this.selection.update((current) => ({ ...current, [key]: valueId }));
    if (this.choicePrompt()?.key === key) this.choicePrompt.set(null);
  }

  pickGift(giftId: string, productId: string): void {
    this.#giftPicks.update((current) => ({
      ...current,
      [giftId]: {
        productId,
        sizeId: current[giftId]?.productId === productId ? current[giftId].sizeId : null,
      },
    }));
    if (this.choicePrompt()?.key === giftStepKey(giftId)) this.choicePrompt.set(null);
  }

  pickGiftSize(giftId: string, sizeId: string): void {
    const pick = this.giftPicks()[giftId];
    if (!pick) return;
    this.#giftPicks.update((current) => ({ ...current, [giftId]: { productId: pick.productId, sizeId } }));
    if (this.choicePrompt()?.key === giftSizeStepKey(giftId)) this.choicePrompt.set(null);
  }

  /** Add to Bag pressed while a choice or a gift is missing, or the chosen size has just sold out. */
  onChoiceMissing(): void {
    const p = this.product();
    if (!p || !this.inStock()) return;
    const sel = this.selection();
    const attempt = (this.choicePrompt()?.attempt ?? 0) + 1;
    const missing = p.options.find((option) => !sel[option.key]);
    if (missing) {
      // The message sits right under its group, so other choices ("Choose your pair") need no name.
      const what = missing.key === 'size' ? 'a size' : missing.key === 'colour' ? 'a colour' : 'an option';
      this.choicePrompt.set({ key: missing.key, message: `Choose ${what} first.`, attempt });
      return;
    }
    if (sel['size'] && !isValueAvailable(p, 'size', sel['size'])) {
      this.choicePrompt.set({
        key: 'size',
        message: 'That size has just sold out. Choose another size.',
        attempt,
      });
      return;
    }
    const box = this.giftBox();
    const giftPrompt = box ? missingGiftPrompt(box, this.giftPicks(), attempt) : null;
    if (giftPrompt) this.choicePrompt.set(giftPrompt);
  }

  onFavoriteClick(): void {
    const p = this.product();
    if (!p) return;
    void this.#favoritesGate.onFavoriteClick(p.id, p.slug);
  }

  retry(): void {
    void this.#router.navigateByUrl(this.#router.url, { onSameUrlNavigation: 'reload' });
  }
}
