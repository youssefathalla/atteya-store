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
import { giftProductLabel } from '@core/services/cart/cart-gifts';
import { bagLineVariant } from '@core/services/cart/cart-deals';
import { giftCardColours, giftCardName } from '@core/services/cart/gift-card-label';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { CurrencyService } from '@core/services/currency/currency.service';
import { canShopOffer, offerTitleVisible } from '@core/services/offers/offer-shop';
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

/** Most products a Bundle price picker lists for each piece. */
const MAX_BUNDLE_CHOICES = 20;
/** Offer ids are Firestore document ids; anything else never goes into a search filter. */
const OFFER_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** One offer line under the price; `shopOfferId` makes it a link to that offer's Shop page. */
interface ProductOfferLine {
  readonly text: string;
  readonly shopOfferId: string | null;
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
    SkeletonComponent,
    AddToBagButtonComponent,
    SizeGuideComponent,
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

  /** Section title for `details`: Materials for clothing, socks and supports, Specifications for gear. */
  readonly detailsTitle = computed(() => productDetailsTitle(this.product()?.categoryIds ?? []));

  /** Size & Fit charts (adult clothing with sizes); empty hides the section. */
  readonly sizeGuides = computed(() => {
    const p = this.product();
    return p ? sizeGuidesFor(p) : [];
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
        // A Bundle price line opens the offer's Shop page, where the shopper picks the other pieces.
        const shopOfferId = offer && kind === 'bundlePrice' && canShopOffer(offer) ? offer.id : null;
        lines.push({ text: title, shopOfferId });
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
    loader: async ({ params }): Promise<BundleChoice[]> => {
      if (!params.shop || !OFFER_ID.test(params.offerId)) return [];
      const result = await this.#search.browseCatalog({
        filters: `offerIds:"${params.offerId}" AND inStock:true`,
        hitsPerPage: MAX_BUNDLE_CHOICES,
        distinct: false,
      });
      const ids = [...new Set(result.hits.map((hit) => hit.objectID))].filter(
        (id) => id !== params.currentId,
      );
      const products = await Promise.all(ids.map((id) => this.#products.getById(id)));
      return products.flatMap((product) => {
        const view = product ? toGiftChoice(product) : null;
        return product && view ? [{ view, product }] : [];
      });
    },
  });

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
    if (!this.bundleOffer() || !this.#bundleActive() || this.bundleLoading()) return 'Add to Bag';
    const pieces = this.bundlePieces();
    const row = this.#pickerRows().find((entry) => entry.quantity === pieces);
    if (!row) return 'Add to Bag';
    const picks = this.#bundlePicks();
    let own = 0;
    for (let piece = 0; piece < pieces; piece++) {
      const pick = picks[piece];
      own += pick ? this.#piecePrice(pick.productId) : this.#fullPrice();
    }
    const total = this.#money(Math.min(row.price, own));
    return pieces === 1 ? `Add to Bag · ${total}` : `Add ${pieces} to Bag · ${total}`;
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
    const sel = this.selection();
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
    if (giftPrompt) {
      this.choicePrompt.set(giftPrompt);
      return;
    }
    const bundlePrompt = this.#bundleActive() ? missingBundlePrompt(this.bundleSteps(), attempt) : null;
    if (bundlePrompt) this.choicePrompt.set(bundlePrompt);
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
