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
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ErrorPageComponent } from '@shared/ui/error-page';
import { injectFirestore } from '@core/firebase';
import { AuthService } from '@core/services/auth/auth.service';
import { giftProductLabel } from '@core/services/cart/cart-gifts';
import { bagLineVariant, type BagPricingProduct, priceBag } from '@core/services/cart/cart-deals';
import { giftCardColours, giftCardName } from '@core/services/cart/gift-card-label';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { CurrencyService } from '@core/services/currency/currency.service';
import { MetaPixelService } from '@core/services/analytics/meta-pixel.service';
import {
  bundleOfferLink,
  canShopOffer,
  type OfferLink,
  offerTitleVisible,
} from '@core/services/offers/offer-shop';
import { FavoritesGateService, FavoritesService } from '@core/services/favorites';
import {
  displayDecimals,
  displayPrice,
  giftChoiceIds,
  giftOfferForProduct,
  liveOffers,
  offerMatch,
  type Offer,
  type OfferBadge,
  type OfferBundleRow,
  priceItem,
  toDisplayAmount,
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
  categoryPageFor,
  productDetailsTitle,
  ProductService,
} from '@core/services/products';
import { SearchService } from '@core/services/search';
import { SeoService, textFromHtml } from '@core/services/seo';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { formatMoney } from '@shared/utils/money';
import { AddToBagButtonComponent } from './components/add-to-bag-button/add-to-bag-button.component';
import { ProductGalleryComponent } from './components/product-gallery/product-gallery.component';
import {
  type BundleRowView,
  ProductBundlePickerComponent,
} from './components/product-bundle-picker/product-bundle-picker.component';
import { ChoiceBoxSkeletonComponent } from './components/choice-box-skeleton/choice-box-skeleton.component';
import { ProductBundleSaveComponent } from './components/product-bundle-save/product-bundle-save.component';
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
  thisProductPhrase,
  toGiftChoice,
} from './utils/product-gifts';
import {
  bundleSaveForProduct,
  bundleSaveHeaderSaving,
  bundleSaveStripText,
  bundleSavePieces,
  bundleSaveSizeStepKey,
  bundleSaveSizeFits,
  bundleSaveSlotChoices,
  bundleSaveStepKey,
  bundleSaveSteps,
  missingBundleSavePrompt,
  ownPieceIndex,
} from './utils/product-bundle-save';
import {
  type BundleChoice,
  type BundlePicks,
  bundleOfferForProduct,
  bundlePieceLine,
  bundleQualifyingChoices,
  bundleSavePercent,
  bundleSizeStepKey,
  bundleStepKey,
  bundleSteps,
  firstBundleRow,
  missingBundlePrompt,
} from './utils/product-bundle';
import { SizeGuideComponent } from './components/size-guide/size-guide.component';
import { watchProductDoc } from './utils/product-live';
import { sizeGuidesFor } from './utils/size-guide';
import {
  findVariant,
  initialSelection,
  isProductInStock,
  isValueAvailable,
} from './utils/product-stock.utils';

/** Most products a Bundle price picker lists for each piece, and a Bundle & Save group lists. */
const MAX_BUNDLE_CHOICES = 20;
/**
 * Products a Bundle & Save section reads for all its groups together (2 to 4), so one group with
 * many colours doesn't leave the others empty.
 */
const MAX_BUNDLE_SAVE_READ = 60;
/** Offer ids are Firestore document ids; anything else never goes into a search filter. */
const OFFER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * One offer line under the price; `link` makes it a link: a Bundle price offer's Shop page, or a
 * Bundle & Save offer's own page with this product picked (`/bundle/<id>?product=<id>`, ATS-279).
 */
interface ProductOfferLine {
  readonly text: string;
  readonly link: OfferLink | null;
}

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
    ProductBundlePickerComponent,
    ProductBundleSaveComponent,
    ChoiceBoxSkeletonComponent,
    SkeletonComponent,
    AddToBagButtonComponent,
    SizeGuideComponent,
    ErrorPageComponent,
  ],
  templateUrl: './product.component.html',
  host: { class: 'block w-full' },
})
export class ProductComponent {
  readonly page = input.required<ProductPageResult>();

  readonly #seo = inject(SeoService);
  readonly #catalog = inject(CatalogService);
  readonly #pixel = inject(MetaPixelService);
  /** Product the Meta Pixel ViewContent was last sent for, so live updates don't repeat it. */
  #viewContentSentFor: string | null = null;
  readonly #playerList = inject(PlayerListService);
  readonly #offersReader = inject(PublicOffersReader);
  readonly #liveOffers = inject(OffersService);
  readonly #firestore = injectFirestore();
  readonly #auth = inject(AuthService);
  readonly #favorites = inject(FavoritesService);
  readonly #favoritesGate = inject(FavoritesGateService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #shippingSettings = inject(ShippingSettingsService);
  readonly #currency = inject(CurrencyService);
  readonly #products = inject(ProductService);
  readonly #search = inject(SearchService);

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

  /**
   * The size and colour facts offers see for the chosen options, built exactly as the bag builds
   * them (`bagLineVariant`), so a size-only offer prices the same here, in the bag and at checkout.
   * Products with sizes but no variant rows still get the chosen size. Null until every option is chosen.
   */
  readonly variantFacts = computed(() => {
    const p = this.product();
    const sel = this.selection();
    if (!p || p.options.some((option) => !sel[option.key])) return null;
    return bagLineVariant(p, { selection: sel, variantId: null });
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

  /** Size chart and details title from the product's categories (ATS-250), as read on the server. */
  readonly #categoryPage = computed(() => {
    const p = this.page();
    return p.status === 'found' ? categoryPageFor(p.product, p.categorySettings) : null;
  });

  /** Section title for `details`: Materials or Specifications, set per category. */
  readonly detailsTitle = computed(() =>
    productDetailsTitle(this.#categoryPage()?.detailsTitle ?? 'specifications'),
  );

  /** Size & Fit charts (clothing size chart categories, products with sizes); empty hides the section. */
  readonly sizeGuides = computed(() => {
    const p = this.product();
    return p ? sizeGuidesFor(p, this.#categoryPage()?.sizeChart ?? 'none') : [];
  });

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
    signedIn: this.#hydrated() && this.#auth.offerSignedIn(),
  }));

  readonly price = computed(() => {
    const p = this.product();
    if (!p) return null;
    const priced = toPricedProduct(p);
    const ctx = this.#pricingCtx();
    const offers = this.#offers();
    const v = this.variantFacts();
    if (v) {
      const r = priceItem(priced, v, offers, ctx);
      return {
        price: r.effectivePrice,
        fromPrice: null,
        listPrice: r.listPrice,
        partial: false,
        ...this.#splitBadges(r.badges, offers),
      };
    }
    // A Bundle price "From" is for cards only: this page prices the size the shopper picks.
    const d = displayPrice(priced, offers, ctx, { bundleFrom: false });
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
   * next to the price. Buy X get Y, Bundle price, tiered and free shipping become one short line with the
   * offer's title. Free gift offers show as the Gift Box, never as a badge.
   */
  #splitBadges(
    badges: readonly OfferBadge[],
    offers: readonly Offer[],
  ): { badges: string[]; offerLines: ProductOfferLine[] } {
    const shown: string[] = [];
    const lines: ProductOfferLine[] = [];
    // An amount in EGP means nothing to a visitor paying in another currency.
    const hideEgp = this.#currency.selected() !== 'EGP';
    const country = this.#currency.visitorCountry();
    for (const badge of badges) {
      const kind = badge.labelOnly
        ? offers.find((offer) => offer.id === badge.offerId)?.reward.kind
        : undefined;
      if (kind === 'freeGift') continue;
      if (
        kind === 'buyXGetY' ||
        kind === 'bundlePrice' ||
        kind === 'bundleSet' ||
        kind === 'tiered' ||
        kind === 'freeShipping'
      ) {
        const offer = offers.find((candidate) => candidate.id === badge.offerId);
        // Free shipping applies to Egypt orders only, so it is never promised abroad.
        if (offer && !offerTitleVisible(offer, country)) continue;
        const title = offer?.title.trim() || badge.text;
        if (lines.some((line) => line.text === title) || (hideEgp && /\bEGP\b/.test(title))) continue;
        // A Bundle price line opens the offer's Shop page and a Bundle & Save line the offer's own
        // page with this product already picked; there the shopper picks the other pieces.
        // The Bundle & Save offer this product is in shows as the black strip instead (ATS-281).
        if (offer && kind === 'bundleSet' && offer.id === this.bundleStrip()?.offerId) continue;
        let link: OfferLink | null = null;
        if (offer && kind === 'bundleSet') {
          const base = bundleOfferLink(offer);
          const productId = this.product()?.id;
          link = productId ? { ...base, query: { product: productId } } : base;
        } else if (offer && kind === 'bundlePrice' && canShopOffer(offer)) {
          link = bundleOfferLink(offer);
        }
        lines.push({ text: title, link });
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
          offer.reward.kind === 'freeGift' && offer.scope === 'item' && offerMatch(offer, facts) !== 'none',
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
    const offer = giftOfferForProduct(
      toPricedProduct(p),
      this.variantFacts(),
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

  /**
   * The Bundle price offer the bag would put this item in (same rules as the bag: product, chosen
   * size or colour, sale items), or null. Known on the server too (offers come with the page), so
   * the picker's space is kept from the first paint.
   */
  readonly bundleOffer = computed(
    () => {
      const p = this.product();
      if (!p || !this.inStock()) return null;
      return bundleOfferForProduct(
        {
          product: toPricedProduct(p),
          variant: this.variantFacts(),
          onSale: p.compareAtPrice !== null && p.compareAtPrice > p.price,
        },
        this.#offers(),
        this.#pricingCtx(),
      );
    },
    {
      equal: (a, b) =>
        a === b ||
        (!!a &&
          !!b &&
          JSON.stringify(a.offer) === JSON.stringify(b.offer) &&
          JSON.stringify(a.rows) === JSON.stringify(b.rows)),
    },
  );

  /** What the picker's product read depends on; plain values, so a live price or stock change reads nothing again. */
  readonly #bundleReadKey = computed(
    () => {
      const bundle = this.bundleOffer();
      const id = this.product()?.id;
      if (!this.#hydrated() || !bundle || !id) return undefined;
      return { offerId: bundle.offer.id, shop: canShopOffer(bundle.offer), currentId: id };
    },
    {
      equal: (a, b) =>
        a === b ||
        (!!a && !!b && a.offerId === b.offerId && a.shop === b.shop && a.currentId === b.currentId),
    },
  );

  /**
   * The offer's other products a piece can be, read in the browser once the page is up: published
   * and in stock, every colour on its own, as Shop lists them. An offer Shop can't list (signed-in
   * only, with a code) offers this product only.
   */
  readonly #bundleOthers = resource({
    params: () => this.#bundleReadKey(),
    loader: ({ params }) => this.#readOfferProducts(params, MAX_BUNDLE_CHOICES),
  });

  /**
   * Up to `max` published, in-stock products of an offer other than this one, read in the browser:
   * Shop's search (every colour on its own), then each product from Firestore as a card. An offer
   * Shop can't list (signed-in only, with a code) gives none.
   */
  async #readOfferProducts(
    params: {
      readonly offerId: string;
      readonly shop: boolean;
      readonly currentId: string;
    },
    max: number,
  ): Promise<BundleChoice[]> {
    if (!params.shop || !OFFER_ID.test(params.offerId)) return [];
    const result = await this.#search.browseCatalog({
      filters: `offerIds:"${params.offerId}" AND inStock:true`,
      hitsPerPage: max,
      distinct: false,
    });
    const ids = [...new Set(result.hits.map((hit) => hit.objectID))].filter((id) => id !== params.currentId);
    const products = await Promise.all(ids.map((id) => this.#products.getById(id)));
    return products.flatMap((product) => {
      const view = product ? toGiftChoice(product) : null;
      return product && view ? [{ view, product }] : [];
    });
  }

  /**
   * Every product a piece can be: this product (live price and stock), then the offer's others,
   * each with only the sizes the bag would count in the offer. Null while loading.
   */
  readonly #bundleChoices = computed<readonly BundleChoice[] | null>(() => {
    const p = this.product();
    const bundle = this.bundleOffer();
    if (!p || !bundle || !this.#bundleOthers.hasValue()) return null;
    const view = toGiftChoice({ ...p, published: !this.removed() });
    const all = [...(view ? [{ view, product: p }] : []), ...this.#bundleOthers.value()];
    return bundleQualifyingChoices(all, bundle.offer, this.#pricingCtx());
  });

  /** Space for the picker while its products load (server render included). */
  readonly bundleLoading = computed(
    () => !!this.bundleOffer() && !this.#bundleOthers.hasValue() && !this.#bundleOthers.error(),
  );

  /** The picker is in use: a Bundle price offer whose products could be read (a failed read falls back to one item). */
  readonly #bundleActive = computed(() => !!this.bundleOffer() && !this.#bundleOthers.error());

  /** How many pieces the shopper picked. Starts on the 1-piece row for every product and offer. */
  readonly #bundlePieces = linkedSignal<string, number | null>({
    source: () => `${this.product()?.id ?? ''}|${this.bundleOffer()?.offer.id ?? ''}`,
    computation: () => null,
  });

  /** This product's own price for one piece (after its item offers), the price rows save against. */
  readonly #fullPrice = computed(() => this.price()?.price ?? this.product()?.price ?? 0);

  /** One piece of a product at its own price after item offers (this product: the price shown above). */
  #piecePrice(productId: string): number {
    if (productId === this.product()?.id) return this.#fullPrice();
    const choice = this.#bundleChoices()?.find((entry) => entry.view.productId === productId);
    if (!choice) return this.#fullPrice();
    return displayPrice(toPricedProduct(choice.product), this.#offers(), this.#pricingCtx(), {
      bundleFrom: false,
    }).fromPrice;
  }

  /**
   * The rows the picker lists: the offer's rows, plus "Get 1" at piece 1's own price when the
   * offer has no 1-piece row, so one piece can still be bought (the bag charges its normal price).
   * Once the products are read, rows for 2+ pieces are dropped when no product can fill pieces 2+
   * (this product has a real choice besides size and the offer lists no other product).
   */
  readonly #pickerRows = computed<readonly OfferBundleRow[]>(() => {
    const bundle = this.bundleOffer();
    if (!bundle) return [];
    const choices = this.#bundleChoices();
    const rows =
      choices && choices.length === 0 ? bundle.rows.filter((row) => row.quantity <= 1) : bundle.rows;
    if (rows.some((row) => row.quantity === 1)) return rows;
    const first = this.#bundlePicks()[0]?.productId;
    return [{ quantity: 1, price: first ? this.#piecePrice(first) : this.#fullPrice() }, ...rows];
  });

  readonly bundlePieces = computed(() => {
    const rows = this.#pickerRows();
    const chosen = this.#bundlePieces();
    if (chosen !== null && rows.some((row) => row.quantity === chosen)) return chosen;
    return firstBundleRow(rows)?.quantity ?? 1;
  });

  /** What the shopper picked for each piece. Piece 1 starts on this product. Cleared for every new product. */
  readonly #bundlePicks = linkedSignal<string | undefined, BundlePicks>({
    source: () => this.product()?.id,
    computation: (id): BundlePicks => (id ? { 0: { productId: id, sizeId: null } } : {}),
  });

  /** This product's card for piece 1 (its size is the choice above, so it never needs a size step). */
  readonly #currentBundleCard = computed(() => {
    const p = this.product();
    if (!p) return null;
    const colours = giftCardColours(p.colors);
    return {
      productId: p.id,
      label: giftProductLabel(p),
      name: p.name,
      colors: p.colors,
      cardName: giftCardName(p.name, colours),
      cardColours: colours,
      imagePath: p.images[0]?.path ?? '',
      sizes: null,
    };
  });

  readonly bundleSteps = computed(() => {
    const p = this.product();
    const card = this.#currentBundleCard();
    const choices = this.#bundleChoices();
    if (!p || !card || !this.bundleOffer() || !choices) return [];
    return bundleSteps(this.bundlePieces(), p.id, card, choices, this.#bundlePicks());
  });

  /** The quantity rows in the visitor's currency, priced against this product's own price. */
  readonly bundleRows = computed<readonly BundleRowView[]>(() => {
    const offerRows = this.bundleOffer()?.rows ?? [];
    const full = this.#fullPrice();
    return this.#pickerRows().map((row) => {
      // The added "Get 1" row is the normal price: nothing to save.
      const savePercent = offerRows.includes(row) ? bundleSavePercent(row, full) : 0;
      return {
        row,
        title: `Get ${row.quantity} for ${this.#money(row.price)}`,
        perPiece: this.#money(Math.round(row.price / row.quantity)),
        fullPrice: savePercent > 0 ? this.#money(full) : '',
        savePercent,
      };
    });
  });

  /**
   * "Add to Bag", or with the total: "Add to Bag · EGP 125", "Add 2 to Bag · EGP 200". Never more
   * than the pieces' own prices, because the bag uses the bundle only when it costs the shopper less.
   */
  readonly addLabel = computed(() => {
    const total = this.#bundleTotalEgp();
    if (total === null) return 'Add to Bag';
    const pieces = this.bundlePieces();
    const money = this.#money(total);
    return pieces === 1 ? `Add to Bag · ${money}` : `Add ${pieces} to Bag · ${money}`;
  });

  /** The Bundle price picker's total in EGP for the pieces chosen, or null when no bundle is being picked. */
  readonly #bundleTotalEgp = computed<number | null>(() => {
    if (!this.bundleOffer() || !this.#bundleActive() || this.bundleLoading()) return null;
    const pieces = this.bundlePieces();
    const row = this.#pickerRows().find((entry) => entry.quantity === pieces);
    if (!row) return null;
    const picks = this.#bundlePicks();
    let own = 0;
    for (let piece = 0; piece < pieces; piece++) {
      const pick = picks[piece];
      own += pick ? this.#piecePrice(pick.productId) : this.#fullPrice();
    }
    return Math.min(row.price, own);
  });

  /** EGP total of what Add to Bag adds, for the Meta Pixel AddToCart (ATS-290). */
  readonly addValueEgp = computed<number | null>(() => {
    const bundle = this.#bundleTotalEgp();
    if (bundle !== null) return bundle;
    const lines = this.bagLines();
    const unit = this.price()?.price;
    if (!lines || unit == null) return null;
    return unit * lines.reduce((sum, line) => sum + line.quantity, 0);
  });

  /**
   * The Bundle & Save offer the bag would put this product in (same rules and order as the bag,
   * leaving out offers Shop can't list), with the group this product fills, or null. Worked out
   * for the product, not its chosen size, so changing size never moves the group or clears picks. Known on the server too (offers come with the page), so
   * the section's space is kept from the first paint.
   */
  readonly bundleSave = computed(
    () => {
      const p = this.product();
      if (!p || !this.inStock()) return null;
      return bundleSaveForProduct(
        {
          product: toPricedProduct(p),
          variant: null,
          onSale: p.compareAtPrice !== null && p.compareAtPrice > p.price,
        },
        this.#offers(),
        this.#pricingCtx(),
        canShopOffer,
      );
    },
    {
      equal: (a, b) =>
        a === b ||
        (!!a && !!b && a.ownSlot === b.ownSlot && JSON.stringify(a.offer) === JSON.stringify(b.offer)),
    },
  );

  /**
   * The black Bundle & Save strip under the price (ATS-281): one link to the offer's page with
   * this product already picked. Null when the product is in no Bundle & Save offer it can show.
   */
  readonly bundleStrip = computed<{
    readonly offerId: string;
    readonly text: string;
    readonly link: OfferLink;
  } | null>(() => {
    const bundle = this.bundleSave();
    const id = this.product()?.id;
    if (!bundle || !id) return null;
    return {
      offerId: bundle.offer.id,
      text: bundleSaveStripText(bundle, (egp) => this.#money(egp)),
      link: { ...bundleOfferLink(bundle.offer), query: { product: id } },
    };
  });

  /** What the section's product read depends on; plain values, so a price or stock change reads nothing again. */
  readonly #bundleSaveReadKey = computed(
    () => {
      const bundle = this.bundleSave();
      const id = this.product()?.id;
      if (!this.#hydrated() || !bundle || !id) return undefined;
      return { offerId: bundle.offer.id, shop: canShopOffer(bundle.offer), currentId: id };
    },
    {
      equal: (a, b) =>
        a === b ||
        (!!a && !!b && a.offerId === b.offerId && a.shop === b.shop && a.currentId === b.currentId),
    },
  );

  /** The offer's other products, read in the browser once the page is up. */
  readonly #bundleSaveOthers = resource({
    params: () => this.#bundleSaveReadKey(),
    loader: ({ params }) => this.#readOfferProducts(params, MAX_BUNDLE_SAVE_READ),
  });

  /** False when this product's chosen size or colour is not one its group takes. */
  readonly #bundleSaveOwnFits = computed(() => {
    const p = this.product();
    const bundle = this.bundleSave();
    const variant = this.variantFacts();
    if (!p || !bundle || !variant) return true;
    return bundleSaveSizeFits(bundle, {
      product: toPricedProduct(p),
      variant,
      onSale: p.compareAtPrice !== null && p.compareAtPrice > p.price,
    });
  });

  /**
   * The products each group can take: this product (live price and stock) and the offer's others,
   * each with only the sizes the bag would count in that group. Null while loading.
   */
  readonly #bundleSaveChoices = computed<readonly (readonly BundleChoice[])[] | null>(() => {
    const p = this.product();
    const bundle = this.bundleSave();
    if (!p || !bundle || !this.#bundleSaveOthers.hasValue()) return null;
    const view = toGiftChoice({ ...p, published: !this.removed() });
    const all = [...(view ? [{ view, product: p }] : []), ...this.#bundleSaveOthers.value()];
    return bundle.slots.map((slot) => bundleSaveSlotChoices(all, bundle.offer, slot, MAX_BUNDLE_CHOICES));
  });

  /** Space for the section while its products load (server render included). */
  readonly bundleSaveLoading = computed(
    () => !!this.bundleSave() && !this.#bundleSaveOthers.hasValue() && !this.#bundleSaveOthers.error(),
  );

  /** What the shopper picked for each piece (index in `bundleSavePieces`). Cleared for every new product or offer. */
  readonly #bundleSavePicks = linkedSignal<string, BundlePicks>({
    source: () => `${this.product()?.id ?? ''}|${this.bundleSave()?.offer.id ?? ''}`,
    computation: () => ({}),
  });

  /**
   * The section's steps; empty hides it (no offer, products not read yet or unreadable, or a
   * group with no in-stock product).
   */
  readonly bundleSaveSteps = computed(() => {
    const p = this.product();
    const bundle = this.bundleSave();
    const choices = this.#bundleSaveChoices();
    if (!p || !bundle || !choices || this.#bundleSaveOthers.error()) return [];
    // Every piece but this product's own needs something to pick.
    const empty = bundle.slots.some((slot, index) => {
      const others = index === bundle.ownSlot ? slot.quantity - 1 : slot.quantity;
      return others > 0 && (choices[index]?.length ?? 0) === 0;
    });
    if (empty) return [];
    const ownDone = this.cartLine() !== null && this.#bundleSaveOwnFits();
    return bundleSaveSteps(
      bundle,
      p.id,
      thisProductPhrase(p.type),
      ownDone,
      choices,
      this.#bundleSavePicks(),
    );
  });

  /** "Save EGP 300", "Save 15%", "Cheapest item free", in the visitor's currency. */
  readonly bundleSaveSaving = computed(() => {
    const bundle = this.bundleSave();
    return bundle ? bundleSaveHeaderSaving(bundle.setReward, (egp) => this.#money(egp)) : '';
  });

  /**
   * One draft line per piece: this product's own line (its options and gifts, or just the
   * options chosen so far when `complete` is false), then each picked product with its size.
   * Null while a piece is still open (or, with `complete`, a size or this product's own choice).
   */
  #bundleSaveDrafts(complete: boolean): CartLineDraft[] | null {
    const p = this.product();
    const bundle = this.bundleSave();
    const choices = this.#bundleSaveChoices();
    if (!p || !bundle || !choices || this.bundleSaveSteps().length === 0) return null;
    if (complete && !this.#bundleSaveOwnFits()) return null;
    const own = ownPieceIndex(bundle);
    const picks = this.#bundleSavePicks();
    const lines: CartLineDraft[] = [];
    const pieces = bundleSavePieces(bundle.slots);
    for (let piece = 0; piece < pieces.length; piece++) {
      if (piece === own) {
        const line =
          this.cartLine() ??
          (complete ? null : { productId: p.id, variantId: null, selection: this.selection(), quantity: 1 });
        if (!line) return null;
        lines.push(line);
        continue;
      }
      const pick = picks[piece];
      const choice =
        pick && choices[pieces[piece]!.slot]?.find((entry) => entry.view.productId === pick.productId);
      if (!pick || !choice) return null;
      const line = bundlePieceLine(choice, pick);
      if (line) {
        lines.push(line);
      } else if (complete) {
        return null;
      } else {
        lines.push({ productId: choice.product.id, variantId: null, selection: {}, quantity: 1 });
      }
    }
    return lines;
  }

  /** What Add Bundle to Bag adds: one line per piece, or null while anything is still open. */
  readonly bundleSaveLines = computed(() => this.#bundleSaveDrafts(true));

  /**
   * "Add Bundle to Bag · EGP 4,900" once every piece's product is picked: what the bag charges for
   * these pieces on their own (the set price when it saves, priced by the bag's own `priceBag`).
   */
  readonly bundleSaveLabel = computed(() => {
    const drafts = this.#bundleSaveDrafts(false);
    const p = this.product();
    const choices = this.#bundleSaveChoices();
    if (!drafts || !p || !choices) return 'Add Bundle to Bag';
    const products = new Map<string, BagPricingProduct>();
    for (const product of [p, ...choices.flat().map((choice) => choice.product)]) {
      products.set(product.id, {
        priced: toPricedProduct(product),
        options: product.options,
        variants: product.variants,
      });
    }
    // Gifts left out: their products aren't read here, and the label is the pieces' price.
    const lines = drafts.map(({ gifts: _gifts, ...line }) => line);
    const priced = priceBag(lines, products, this.#offers(), this.#pricingCtx());
    let total = 0;
    for (const line of priced.lines) {
      if (!line) return 'Add Bundle to Bag';
      total += line.lineEgp;
    }
    return `Add Bundle to Bag · ${this.#money(total)}`;
  });

  #money(egp: number): string {
    const entry = this.#currency.entry();
    return formatMoney(toDisplayAmount(egp, entry), entry.code, displayDecimals(entry.code));
  }

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

  /**
   * What Add to Bag adds: this product's line, or with a Bundle price picker one line per piece.
   * Null while a choice, a gift or a piece is still open.
   */
  readonly bagLines = computed<readonly CartLineDraft[] | null>(() => {
    if (!this.#bundleActive()) {
      const line = this.cartLine();
      return line ? [line] : null;
    }
    const p = this.product();
    const choices = this.#bundleChoices();
    if (!p || !choices) return null;
    const steps = this.bundleSteps();
    if (steps.length === 0 || missingBundlePrompt(steps, 0)) return null;
    const picks = this.#bundlePicks();
    const lines: CartLineDraft[] = [];
    for (let piece = 0; piece < this.bundlePieces(); piece++) {
      const pick = picks[piece];
      if (!pick) return null;
      if (piece === 0 && pick.productId === p.id) {
        const line = this.cartLine();
        if (!line) return null;
        lines.push(line);
        continue;
      }
      const choice = choices.find((entry) => entry.view.productId === pick.productId);
      const line = choice ? bundlePieceLine(choice, pick) : null;
      if (!line) return null;
      lines.push(line);
    }
    return lines;
  });

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

    // Meta Pixel ViewContent, once per product opened (ATS-290). Prices are stored in EGP.
    effect(() => {
      const page = this.page();
      if (!this.#hydrated() || page.status !== 'found') return;
      const p = page.product;
      if (this.#viewContentSentFor === p.id) return;
      this.#viewContentSentFor = p.id;
      untracked(() => {
        const value = this.price()?.price ?? p.price;
        const category = this.#catalog.categoryBySlug(p.categoryId)?.name;
        this.#pixel.track('ViewContent', {
          content_ids: [p.id],
          content_name: p.name,
          content_type: 'product',
          ...(category ? { content_category: category } : {}),
          contents: [{ id: p.id, quantity: 1, item_price: value }],
          currency: 'EGP',
          value,
        });
      });
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
          type: 'product',
          image: p.images[0]?.path ?? null,
          shareDescription: p.summary?.trim() || textFromHtml(p.descriptionHtml) || null,
        });
      } else {
        this.#seo.setPageMetadata({
          title: page.status === 'missing' ? 'Page Not Found | Atteya Store' : 'Product | Atteya Store',
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

  pickBundleRow(pieces: number): void {
    this.#bundlePieces.set(pieces);
    const key = this.choicePrompt()?.key ?? '';
    if (key.startsWith('bundle')) this.choicePrompt.set(null);
  }

  pickBundleProduct(piece: number, productId: string): void {
    this.#bundlePicks.update((current) => ({
      ...current,
      [piece]: {
        productId,
        sizeId: current[piece]?.productId === productId ? current[piece].sizeId : null,
      },
    }));
    if (this.choicePrompt()?.key === bundleStepKey(piece)) this.choicePrompt.set(null);
  }

  pickBundleSize(piece: number, sizeId: string): void {
    const pick = this.#bundlePicks()[piece];
    if (!pick) return;
    this.#bundlePicks.update((current) => ({ ...current, [piece]: { productId: pick.productId, sizeId } }));
    if (this.choicePrompt()?.key === bundleSizeStepKey(piece)) this.choicePrompt.set(null);
  }

  /** Piece 1 is this product: its options and gifts are asked for above the picker. */
  #pieceOneIsThisProduct(): boolean {
    const p = this.product();
    return !this.#bundleActive() || (!!p && this.#bundlePicks()[0]?.productId === p.id);
  }

  /** Add to Bag pressed while a choice or a gift is missing, or the chosen size has just sold out. */
  onChoiceMissing(): void {
    const p = this.product();
    if (!p || !this.inStock()) return;
    const attempt = (this.choicePrompt()?.attempt ?? 0) + 1;
    if (!this.#pieceOneIsThisProduct()) {
      const bundlePrompt = missingBundlePrompt(this.bundleSteps(), attempt);
      if (bundlePrompt) this.choicePrompt.set(bundlePrompt);
      return;
    }
    const own = this.#ownChoicePrompt(p, attempt);
    if (own) {
      this.choicePrompt.set(own);
      return;
    }
    const bundlePrompt = this.#bundleActive() ? missingBundlePrompt(this.bundleSteps(), attempt) : null;
    if (bundlePrompt) this.choicePrompt.set(bundlePrompt);
  }

  /** Add Bundle to Bag pressed while this product's own choice or a piece of the set is still open. */
  onBundleSaveMissing(): void {
    const p = this.product();
    if (!p || !this.inStock()) return;
    const attempt = (this.choicePrompt()?.attempt ?? 0) + 1;
    const own = this.#ownChoicePrompt(p, attempt);
    if (own) {
      this.choicePrompt.set(own);
      return;
    }
    if (!this.#bundleSaveOwnFits()) {
      // The group takes only some of this product's sizes (or colours): ask for one it takes.
      const key = p.options.some((option) => option.key === 'size') ? 'size' : 'colour';
      const what = key === 'size' ? 'size' : 'colour';
      this.choicePrompt.set({
        key,
        message: `This ${what} isn't part of the bundle. Choose another ${what}.`,
        attempt,
      });
      return;
    }
    const prompt = missingBundleSavePrompt(this.bundleSaveSteps(), attempt);
    if (prompt) this.choicePrompt.set(prompt);
  }

  /** The first of this product's own choices still open: an option, a size just sold out, or a gift. */
  #ownChoicePrompt(p: ProductView, attempt: number): ChoicePrompt | null {
    const sel = this.selection();
    const missing = p.options.find((option) => !sel[option.key]);
    if (missing) {
      // The message sits right under its group, so other choices ("Choose your pair") need no name.
      const what = missing.key === 'size' ? 'a size' : missing.key === 'colour' ? 'a colour' : 'an option';
      return { key: missing.key, message: `Choose ${what} first.`, attempt };
    }
    if (sel['size'] && !isValueAvailable(p, 'size', sel['size'])) {
      return { key: 'size', message: 'That size has just sold out. Choose another size.', attempt };
    }
    const box = this.giftBox();
    return box ? missingGiftPrompt(box, this.giftPicks(), attempt) : null;
  }

  pickBundleSaveProduct(piece: number, productId: string): void {
    this.#bundleSavePicks.update((current) => ({
      ...current,
      [piece]: {
        productId,
        sizeId: current[piece]?.productId === productId ? current[piece].sizeId : null,
      },
    }));
    if (this.choicePrompt()?.key === bundleSaveStepKey(piece)) this.choicePrompt.set(null);
  }

  pickBundleSaveSize(piece: number, sizeId: string): void {
    const pick = this.#bundleSavePicks()[piece];
    if (!pick) return;
    this.#bundleSavePicks.update((current) => ({
      ...current,
      [piece]: { productId: pick.productId, sizeId },
    }));
    if (this.choicePrompt()?.key === bundleSaveSizeStepKey(piece)) this.choicePrompt.set(null);
  }

  onFavoriteClick(): void {
    const p = this.product();
    if (!p) return;
    void this.#favoritesGate.onFavoriteClick(p.id, p.slug);
  }
}
