import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  PLATFORM_ID,
  resource,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { doc, getDoc } from 'firebase/firestore';
import { canCheckout, lineDisplayAmount } from '@core/services/cart/cart-pricing';
import { priceBag, type PricedBagLine } from '@core/services/cart/cart-deals';
import { bagGiftKey, giftNoteText } from '@core/services/cart/bag-offer-notes';
import { BagOfferNotesService } from '@core/services/cart/bag-offer-notes.service';
import { bagOfferLook, type BagNotesProduct } from '@core/services/cart/bag-offer-state';
import {
  bundleNudgeText,
  bundleStripTitle,
  canShopOffer,
  dealHintAction,
  dealHintText,
  earnedItemLabel,
  offerShopQuery,
  shortItemWord,
} from '@core/services/offers/offer-shop';
import { CatalogService } from '@core/services/products/catalog.service';
import { isBankTransferLive, isCardOrWalletLive } from '@core/config/store-info';
import { AuthService } from '@core/services/auth/auth.service';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { giftLineLabel, giftNameFor, giftProductLabel } from '@core/services/cart/cart-gifts';
import { cartLineKey, type CartLineDraft } from '@core/services/cart/cart.model';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import { dealTag, displayDecimals, toDisplayAmount, type BagDealHint } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { OffersService } from '@core/services/offers/offers.service';
import { PRODUCT_GENDERS } from '@core/services/products/product.constants';
import type { Product, ProductGenderId } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SearchService, type SearchHit } from '@core/services/search';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import type { ProductCardData } from '@shared/components/product-card/product-card.model';
import { searchHitCardPrice, searchHitToCardData } from '@shared/components/product-card/product-card.utils';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { PaymentMarkComponent } from '@shared/ui/payment-mark';
import { RowScrollNavComponent } from '@shared/ui/row-scroll-nav';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import { useBreakpoint } from '@shared/utils/breakpoint.utils';
import {
  BAG_RECOMMENDATION_FETCH,
  bagPaymentMethods,
  bagRecommendationFilter,
  pickBagRecommendations,
} from './utils/bag-extras';
import { BagFreePickComponent } from './components/bag-free-pick/bag-free-pick.component';
import { BagOfferNotesComponent } from '@shared/components/bag-offer-notes/bag-offer-notes.component';

interface CartProductInfo extends BagNotesProduct {
  readonly name: string;
  readonly slug: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly imagePath: string | null;
  readonly imageAlt: string;
  readonly options: Product['options'];
  /** Palette colour ids, so a free gift can be named with its colour. */
  readonly colors: readonly string[];
  /** "Men", "Women" or "Unisex"; null when the product has no gender set. */
  readonly genderLabel: string | null;
  /** Main (leaf) category, used to pick the "Recommended for You" products. */
  readonly categoryId: string;
}

/** One bag line's price in the visitor's currency, after offers. */
interface CartLinePrice {
  /** What the line costs now. */
  readonly total: string;
  /** The line before offers and sale prices, struck through; empty when nothing came off. */
  readonly was: string;
  /** Buy X Get Y tag ("Free", "1 free", "−50%"); empty when none. */
  readonly deal: string;
  /** Pieces that still come with the line's free gifts. */
  readonly giftUnits: number;
}

/** One free gift under its item: "Free shirt: Adidas Simple Polo White, L". */
interface CartGiftRow {
  readonly key: string;
  readonly label: string;
  /** Main photo of the gift product; null while it loads or when it has none. */
  readonly imagePath: string | null;
}

/** The grey strip along the bottom of an item card: which offer applies and what it saves. */
interface CartLineStrip {
  readonly key: string;
  /** Offer title, with its percent off when it has one ("Autumn Sale · 21% off"). */
  readonly title: string;
  /** Buy X Get Y tag ("1 free", "−50%"); empty when none. */
  readonly tag: string;
  /** Right-hand text: "You save EGP 250" or "2 free gifts". */
  readonly end: string;
}

/**
 * A Bundle price offer under the last item that counts toward it: the grey strip ("Socks · 2 for
 * EGP 200", "You save EGP 150") once pieces are in the bundle, and the dashed nudge to the next row.
 */
interface CartBundleBox {
  readonly offerId: string;
  /** Strip title; null while no piece is in the bundle. */
  readonly strip: string | null;
  readonly saving: string;
  /** "Add 1 more to get 3 for EGP 275"; null at the top row. */
  readonly nudge: string | null;
  readonly missing: number;
  /** Query params of Choose Another: the offer's Shop page, or plain Shop when it can't be filtered. */
  readonly shopQuery: { readonly offer: string } | null;
}

/** One Buy X Get Y nudge under an item, with its wording and what its button does. */
interface CartDealNudge {
  readonly hint: BagDealHint;
  readonly text: string;
  /**
   * `add-same`: Add 2 adds more of this item. `shop`: Shop the Offer opens Shop filtered to it.
   * `browse`: Keep Shopping opens Shop (an offer Shop can't filter on).
   */
  readonly action: 'add-same' | 'shop' | 'browse';
  readonly shopQuery: { readonly offer: string };
}

/**
 * Product details by id. `null` means the product is no longer available (deleted or
 * unpublished). An id with no entry has not loaded yet, or could not be read this time.
 */
type CartProducts = ReadonlyMap<string, CartProductInfo | null>;

const NO_PRODUCTS: CartProducts = new Map();

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function genderLabel(gender: ProductGenderId | undefined): string | null {
  if (!gender) return null;
  return PRODUCT_GENDERS.find((entry) => entry.id === gender)?.label ?? null;
}

/** Search hits for the "Recommended for You" row, with the time they were read (for offer pricing). */
interface BagRecommendationHits {
  readonly hits: readonly SearchHit[];
  readonly readAtMs: number;
}

@Component({
  selector: 'app-cart-drawer',
  imports: [
    RouterLink,
    NgOptimizedImage,
    MatButtonModule,
    SharedIconModule,
    AppImageFallbackDirective,
    ProductCardComponent,
    HorizontalScrollDirective,
    RowScrollNavComponent,
    PaymentMarkComponent,
    BagFreePickComponent,
    BagOfferNotesComponent,
  ],
  templateUrl: './cart-drawer.component.html',
  host: {
    // min-h-0 lets the flex mid section scroll inside a viewport-bounded drawer
    class: 'h-full min-h-0 flex flex-col',
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class CartDrawerComponent {
  /**
   * Where this copy of the bag is mounted: `side` = the desktop drawer, `sheet` = the phone
   * slide-up panel. Both copies stay mounted; only the phone copy shows (and loads) recommendations.
   */
  readonly placement = input.required<'side' | 'sheet'>();

  readonly drawerService = inject(DrawerService);
  readonly #cart = inject(CartService);
  readonly #currency = inject(CurrencyService);
  readonly #search = inject(SearchService);
  readonly #offers = inject(OffersService);
  /** Category names for the nudge ("Add 2 more from T-shirts & polos"); NavService keeps it loaded. */
  readonly #catalog = inject(CatalogService);
  readonly #auth = inject(AuthService);
  readonly #firestore = injectFirestore();
  readonly #isDesktop = useBreakpoint(1024);
  readonly #notes = inject(BagOfferNotesService);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly lines = this.#cart.lines;
  readonly isEmpty = this.#cart.isEmpty;
  readonly count = this.#cart.count;
  readonly showCheckout = computed(() => canCheckout(!this.isEmpty()));
  /** "1 item" / "4 items": the number of pieces in the bag, for the heading. */
  readonly countLabel = computed(() => {
    const count = this.count();
    return `${count} ${count === 1 ? 'item' : 'items'}`;
  });

  /**
   * Payment methods checkout offers for the visitor's country (Egypt when the country is not
   * known yet, the same fallback checkout uses).
   */
  readonly paymentMethods = computed(() =>
    bagPaymentMethods(
      (this.#currency.visitorCountry() ?? 'EG') === 'EG',
      isCardOrWalletLive(),
      isBankTransferLive(),
    ),
  );
  /** Rows are tracked by product + chosen options, so removing one row leaves the others in place. */
  readonly lineKey = cartLineKey;

  removeLine(index: number): void {
    this.#cart.removeAt(index);
  }

  decreaseQuantity(index: number): void {
    const line = this.lines()[index];
    if (!line) return;
    if (line.quantity <= 1) {
      this.#cart.removeAt(index);
      return;
    }
    this.#cart.setQuantity(index, line.quantity - 1);
  }

  increaseQuantity(index: number): void {
    const line = this.lines()[index];
    if (!line || line.quantity >= 20) return;
    this.#cart.setQuantity(index, line.quantity + 1);
  }

  /**
   * Distinct product ids in the bag (free gifts included), sorted. Changes only when a product
   * is added or removed, so + / − on a line never re-reads the products.
   */
  readonly #productIds = computed(
    () =>
      [
        ...new Set(
          this.lines().flatMap((line) => [
            line.productId,
            ...(line.gifts ?? []).map((gift) => gift.productId),
          ]),
        ),
      ].sort(),
    { equal: sameIds },
  );

  /** Reads only products that are not loaded yet; products already read are reused. */
  readonly productsResource = resource({
    params: () => this.#productIds(),
    loader: async ({ params: ids }): Promise<CartProducts> => {
      if (ids.length === 0) return NO_PRODUCTS;
      const known = untracked(this.#products);
      const products = new Map<string, CartProductInfo | null>();
      const missing: string[] = [];
      for (const id of ids) {
        const info = known.get(id);
        if (info === undefined) missing.push(id);
        else products.set(id, info);
      }
      const loaded = await Promise.all(missing.map((id) => this.#readProduct(id)));
      missing.forEach((id, index) => {
        const info = loaded[index];
        // undefined = this read failed; leave it out so the next load tries again.
        if (info !== undefined) products.set(id, info);
      });
      return products;
    },
  });

  /**
   * The products shown in the bag. While a newly added product loads (the resource has
   * no value), the products already loaded stay on screen; only the new row waits.
   */
  readonly #products = linkedSignal<CartProducts | undefined, CartProducts>({
    source: () => (this.productsResource.hasValue() ? this.productsResource.value() : undefined),
    computation: (next, previous) => next ?? previous?.value ?? NO_PRODUCTS,
  });

  /**
   * Reads one product and never throws, so one bad line never breaks the whole bag.
   * `null` = no longer available: deleted, or unpublished (shoppers get permission-denied,
   * admins see `published: false`). `undefined` = could not be read right now (offline,
   * or the doc fails `ProductSchema`).
   */
  async #readProduct(productId: string): Promise<CartProductInfo | null | undefined> {
    const converter = createValibotConverter(ProductSchema);
    try {
      const snap = await getDoc(doc(this.#firestore, 'products', productId).withConverter(converter));
      if (!snap.exists()) return null;
      const data = snap.data();
      if (!data.published) return null;
      const primary = data.images[0];
      return {
        genderLabel: genderLabel(data.gender),
        categoryId: data.categoryId,
        name: data.name,
        slug: data.slug,
        price: data.price,
        compareAtPrice: data.compareAtPrice,
        imagePath: primary?.path ?? null,
        imageAlt: primary?.alt || data.name,
        colors: data.colors,
        options: data.options,
        variants: data.variants,
        priced: toPricedProduct(data),
        stock: typeof data.stock === 'number' ? data.stock : null,
        inStock: data.inStock,
        stockBySize: data.stockBySize ?? null,
      };
    } catch (error) {
      return isPermissionDenied(error) ? null : undefined;
    }
  }

  /**
   * The bag priced like checkout and the order: per-item offers on each piece, then Buy X Get Y
   * over the whole bag (catalog prices until live offers load). Display only.
   */
  readonly #pricedBag = computed(() => {
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : [];
    const ctx = { now: this.#offers.now(), signedIn: this.#auth.offerSignedIn(), codes: [] };
    return priceBag(this.lines(), this.#products(), offers, ctx);
  });

  /**
   * What the bag gets from offers right now, for the notes that say when an offer stops applying
   * (`BagOfferNotesService`); null until the live offers and every product have loaded.
   */
  readonly #offerLook = computed(() => {
    if (!this.#offers.ready() || this.#offers.failed()) return null;
    const offers = this.#offers.all();
    const ctx = { now: this.#offers.now(), signedIn: this.#auth.offerSignedIn(), codes: [] };
    return bagOfferLook({
      bagKey: this.#notes.bagKey(),
      lines: this.lines(),
      products: this.#products(),
      priced: this.#pricedBag().lines,
      offers,
      ctx,
    });
  });

  /** Gifts under their item that can no longer be given ("Your free shirt is no longer available."). */
  readonly #giftNotes = computed(() => new Map(this.#notes.giftNotes().map((note) => [note.key, note])));

  constructor() {
    effect(() => {
      const look = this.#offerLook();
      if (this.#isBrowser && look) untracked(() => this.#notes.observe('bag', look));
    });
  }

  /** The notes under one line for its free gifts that can no longer be given. */
  giftNotes(line: CartLineDraft): readonly string[] {
    const notes = this.#giftNotes();
    if (notes.size === 0) return [];
    const lineKey = cartLineKey(line);
    return (line.gifts ?? []).flatMap((gift) => {
      const note = notes.get(bagGiftKey(lineKey, gift.offerId, gift.giftId));
      return note ? [giftNoteText(note.name)] : [];
    });
  }

  /** Each line's price in the visitor's currency, in bag order; null while it loads or is gone. */
  readonly linePrices = computed((): readonly (CartLinePrice | null)[] => {
    const entry = this.#currency.entry();
    const decimals = displayDecimals(entry.code);
    const products = this.#products();
    const bag = this.#pricedBag();
    return this.lines().map((line, index) => {
      const priced = bag.lines[index];
      const info = products.get(line.productId);
      if (!priced || !info) return null;
      const total = this.#lineDisplay(priced, line.quantity);
      const listUnit = Math.max(info.price, info.compareAtPrice ?? 0);
      const wasAmount = lineDisplayAmount(toDisplayAmount(listUnit, entry), line.quantity);
      return {
        total: formatMoney(total, entry.code, decimals),
        was: wasAmount > total ? formatMoney(wasAmount, entry.code, decimals) : '',
        deal: dealTag(priced.deals.deals, line.quantity),
        giftUnits: priced.deals.giftUnits,
      };
    });
  });

  readonly subtotal = computed(() => {
    const entry = this.#currency.entry();
    const bag = this.#pricedBag();
    let amount = 0;
    this.lines().forEach((line, index) => {
      const priced = bag.lines[index];
      if (priced) amount += this.#lineDisplay(priced, line.quantity);
    });
    return formatMoney(amount, entry.code, displayDecimals(entry.code));
  });

  /**
   * Buy X Get Y nudges under each line ("Add 2 more to get 1 free", "You've earned a free grip"),
   * with their wording and action: Add 2 for an offer on one product, Shop the Offer otherwise.
   */
  readonly #hintsByLine = computed(() => {
    const offers = new Map(this.#offers.all().map((offer) => [offer.id, offer]));
    const categories = this.#catalog.categories() ?? [];
    const categoryName = (id: string): string | null =>
      categories.find((category) => category.id === id)?.name ?? null;
    const map = new Map<number, CartDealNudge[]>();
    for (const hint of this.#pricedBag().hints) {
      const offer = offers.get(hint.offerId);
      const nudge: CartDealNudge = {
        hint,
        text: dealHintText(hint, offer, categoryName),
        action: dealHintAction(offer),
        shopQuery: offerShopQuery(hint.offerId),
      };
      map.set(hint.lineIndex, [...(map.get(hint.lineIndex) ?? []), nudge]);
    }
    return map;
  });

  /** For the free-item tiles: would adding this product really make it free (see `priceBag`). */
  readonly wouldDiscount = computed(() => this.#pricedBag().wouldDiscount);

  /**
   * The small label under an item that pays full price because it gets another item free or
   * cheaper, its own per-item offer having lost to that bigger saving: "Gets you the free bag",
   * "Gets you 50% off the bag" (the free item's category as a short word; generic when unknown).
   * Empty for every other line, in bag order.
   */
  readonly earnedLabels = computed((): readonly string[] => {
    const products = this.#products();
    const bag = this.#pricedBag();
    const categories = this.#catalog.categories() ?? [];
    const lines = this.lines();
    const wordFor = (index: number): string | null => {
      const line = lines[index];
      const info = line ? products.get(line.productId) : null;
      if (!info) return null;
      return shortItemWord(categories.find((category) => category.id === info.categoryId)?.name);
    };
    return lines.map((_, index) => {
      const priced = bag.lines[index];
      const earned = priced?.deals.earns[0];
      // Only when the line has a per-item offer it gave up for the deal.
      if (!priced || !earned || !priced.appliedOfferId || priced.unitEgp >= priced.baseEgp) return '';
      const words = new Set(earned.freeLines.map(wordFor));
      const word = words.size === 1 ? [...words][0]! : null;
      return earnedItemLabel(earned.percent, word);
    });
  });

  /** Bundle price strips and nudges, by the bag line they sit under. */
  readonly #bundlesByLine = computed(() => {
    const entry = this.#currency.entry();
    const decimals = displayDecimals(entry.code);
    const money = (egp: number): string => formatMoney(toDisplayAmount(egp, entry), entry.code, decimals);
    const offers = new Map(this.#offers.all().map((offer) => [offer.id, offer]));
    const map = new Map<number, CartBundleBox[]>();
    for (const bundle of this.#pricedBag().bundles) {
      const strip = bundleStripTitle(bundle, money);
      const nudge = bundleNudgeText(bundle, money);
      if (!strip && !nudge) continue;
      const offer = offers.get(bundle.offerId);
      const box: CartBundleBox = {
        offerId: bundle.offerId,
        strip,
        saving: bundle.saving > 0 ? `You save ${money(bundle.saving)}` : '',
        nudge,
        missing: bundle.next?.missing ?? 0,
        shopQuery: offer && canShopOffer(offer) ? offerShopQuery(offer.id) : null,
      };
      map.set(bundle.lineIndex, [...(map.get(bundle.lineIndex) ?? []), box]);
    }
    return map;
  });

  bundleBoxes(index: number): readonly CartBundleBox[] {
    return this.#bundlesByLine().get(index) ?? [];
  }

  dealHints(index: number): readonly CartDealNudge[] {
    return this.#hintsByLine().get(index) ?? [];
  }

  /** "Add 1" on a nudge: adds the missing pieces to the line (at most 20 per line, like the + button). */
  addMore(index: number, missing: number): void {
    const line = this.lines()[index];
    if (!line) return;
    this.#cart.setQuantity(index, Math.min(20, line.quantity + missing));
  }

  /**
   * The offer strips of each line, in bag order: the per-item offer (with what it saves against the
   * product's own price), each Buy X Get Y offer, and the line's free gifts. Display only.
   */
  readonly lineStrips = computed((): readonly (readonly CartLineStrip[])[] => {
    const entry = this.#currency.entry();
    const decimals = displayDecimals(entry.code);
    const money = (amount: number): string => formatMoney(amount, entry.code, decimals);
    const offers = this.#offers.all();
    const titleOf = (offerId: string): string =>
      offers.find((offer) => offer.id === offerId)?.title || 'Offer applied';
    const products = this.#products();
    const bag = this.#pricedBag();
    return this.lines().map((line, index) => {
      const priced = bag.lines[index];
      const info = products.get(line.productId);
      if (!priced || !info) return [];
      const strips: CartLineStrip[] = [];

      // One discount per item: only the pieces outside a Buy X Get Y group that won keep the offer.
      const offerUnits = priced.deals.offerUnits;
      if (priced.appliedOfferId && offerUnits > 0) {
        const base = lineDisplayAmount(toDisplayAmount(info.price, entry), offerUnits);
        const now = lineDisplayAmount(toDisplayAmount(priced.unitEgp, entry), offerUnits);
        const title = titleOf(priced.appliedOfferId);
        // Measured against the product's own price, like "You save", not the compare-at price the
        // engine's `discountPercent` uses for an item that is already on sale.
        const percent = info.price > 0 ? Math.round(((info.price - priced.unitEgp) / info.price) * 100) : 0;
        strips.push({
          key: `item-${priced.appliedOfferId}`,
          title: percent > 0 ? `${title} · ${percent}% off` : title,
          tag: '',
          end: base > now ? `You save ${money(base - now)}` : '',
        });
      }

      for (const deal of priced.deals.deals) {
        // A bundle has one strip for all its pieces, under its last item (`bundleBoxes`).
        if (deal.bundle) continue;
        strips.push({
          key: `deal-${deal.offerId}`,
          title: titleOf(deal.offerId),
          tag: dealTag([deal], line.quantity),
          end: deal.discount > 0 ? `You save ${money(toDisplayAmount(deal.discount, entry))}` : '',
        });
      }

      const gifts = this.giftRows(line, index);
      const giftOfferId = line.gifts?.[0]?.offerId;
      const giftCount = gifts.length * priced.deals.giftUnits;
      if (gifts.length > 0 && giftOfferId) {
        strips.push({
          key: `gift-${giftOfferId}`,
          title: titleOf(giftOfferId),
          tag: '',
          // The order adds each gift once per piece that keeps its gifts, so count them all.
          end: giftCount === 1 ? '1 free gift' : `${giftCount} free gifts`,
        });
      }
      return strips;
    });
  });

  /**
   * Convert, then × quantity (as before); a line with pieces in a Buy X Get Y group converts its
   * total (those pieces are priced apart from the per-item offer).
   */
  #lineDisplay(priced: PricedBagLine, quantity: number): number {
    const entry = this.#currency.entry();
    return priced.deals.dealUnits > 0
      ? toDisplayAmount(priced.lineEgp, entry)
      : lineDisplayAmount(toDisplayAmount(priced.unitEgp, entry), quantity);
  }

  productInfo(productId: string): CartProductInfo | undefined {
    return this.#products().get(productId) ?? undefined;
  }

  /** True when the product was read and is deleted or unpublished. */
  isUnavailable(productId: string): boolean {
    return this.#products().get(productId) === null;
  }

  imagePath(rawPath: string): string {
    return normalizeImageKitPath(rawPath);
  }

  /**
   * One quiet line under the name: size first with its label, then the other choices, then the
   * gender when the product name doesn't already say it ("Size M · Black · Women").
   */
  optionsLine(productId: string, selection: CartLineDraft['selection']): string {
    const info = this.productInfo(productId);
    if (!info) return '';
    const parts: string[] = [];
    const entries = Object.entries(selection).sort(([a], [b]) => Number(b === 'size') - Number(a === 'size'));
    for (const [key, valueId] of entries) {
      const id = valueId.trim();
      if (!id) continue;
      const option = info.options.find((item) => item.key === key);
      const valueLabel = option?.values.find((value) => value.id === id)?.label;
      // A choice the product no longer lists (or a product that has not loaded yet) is
      // left out, so an internal id never reaches the bag.
      if (valueLabel) parts.push(key === 'size' ? `Size ${valueLabel}` : valueLabel);
    }
    const gender = info.genderLabel;
    // Whole words only: "Men" is not in "Tournament", and "Women" does not say "Men".
    if (gender && !new RegExp(`\\b${gender}\\b`, 'i').test(info.name)) parts.push(gender);
    return parts.join(' · ');
  }

  /** The free gifts picked for one line, each as "Free shirt: Adidas Simple Polo White, L". */
  giftRows(line: CartLineDraft, index: number): readonly CartGiftRow[] {
    const gifts = line.gifts ?? [];
    // Every piece has a Buy X Get Y discount instead, so none comes with gifts.
    if (gifts.length === 0 || this.linePrices()[index]?.giftUnits === 0) return [];
    const offers = this.#offers.all();
    const notes = this.#giftNotes();
    const lineKey = cartLineKey(line);
    // A gift that can no longer be given shows its note instead (`giftNotes`).
    const given = gifts.filter((gift) => !notes.has(bagGiftKey(lineKey, gift.offerId, gift.giftId)));
    return given.map((gift) => {
      const name = giftNameFor(offers, gift.offerId, gift.giftId);
      const info = this.productInfo(gift.productId);
      const size = info?.options
        .find((option) => option.key === 'size')
        ?.values.find((value) => value.id === gift.sizeId)?.label;
      return {
        key: `${gift.offerId}/${gift.giftId}`,
        label: info ? giftLineLabel(name, giftProductLabel(info), size ?? null) : name,
        imagePath: info?.imagePath ?? null,
      };
    });
  }

  /** True once this copy of the bag has been on screen; recommendations load from then on. */
  readonly #shown = linkedSignal<boolean, boolean>({
    source: () => this.drawerService.isOpen('cart') && (this.placement() === 'side') === this.#isDesktop(),
    computation: (now, previous) => now || (previous?.value ?? false),
  });

  /**
   * The bag's main categories (bought items only, not free gifts), sorted. Changes only when a
   * product is added or removed.
   */
  readonly #bagCategoryIds = computed(
    () => {
      const products = this.#products();
      const ids = new Set<string>();
      for (const line of this.lines()) {
        const info = products.get(line.productId);
        if (info) ids.add(info.categoryId);
      }
      return [...ids].sort();
    },
    { equal: sameIds },
  );

  readonly #recommendationsResource = resource({
    params: () => {
      // The desktop side bag has no Recommended row, so it never reads any products.
      if (this.placement() !== 'sheet' || !this.#shown()) return undefined;
      return bagRecommendationFilter(this.#bagCategoryIds()) ?? undefined;
    },
    loader: async ({ params: filters }): Promise<BagRecommendationHits> => {
      const result = await this.#search.browseCatalog({
        filters,
        hitsPerPage: BAG_RECOMMENDATION_FETCH,
      });
      return { hits: result.hits, readAtMs: Date.now() };
    },
  });

  /**
   * The last hits read. While the next read loads (a product was added or removed), the row
   * keeps the cards it has instead of disappearing; it empties when the bag is empty.
   */
  readonly #recommendationHits = linkedSignal<
    BagRecommendationHits | null | undefined,
    BagRecommendationHits | null
  >({
    source: () => {
      if (this.isEmpty()) return null;
      return this.#recommendationsResource.hasValue() ? this.#recommendationsResource.value() : undefined;
    },
    computation: (next, previous) => (next === undefined ? (previous?.value ?? null) : next),
  });

  /** Up to 4 in-stock products from the bag's categories that are not in the bag yet. */
  readonly recommendations = computed<readonly ProductCardData[]>(() => {
    const loaded = this.#recommendationHits();
    if (!loaded) return [];
    const inBag = new Set(this.lines().map((line) => line.productId));
    const hits = pickBagRecommendations(loaded.hits, inBag);
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : null;
    const ctx = { now: new Date(loaded.readAtMs), signedIn: this.#auth.offerSignedIn() };
    return hits.map((hit) => searchHitToCardData(hit, searchHitCardPrice(hit, offers, ctx)));
  });

  onEscape(): void {
    if (this.drawerService.isOpen('cart')) {
      this.drawerService.close();
    }
  }
}
