import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, resource, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { doc, getDoc } from 'firebase/firestore';
import { canCheckout, lineDisplayAmount } from '@core/services/cart/cart-pricing';
import { dealHintText, priceBag, type BagPricingProduct } from '@core/services/cart/cart-deals';
import { isCardOrWalletLive } from '@core/config/store-info';
import { AuthService } from '@core/services/auth/auth.service';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { giftLineLabel, giftNameFor, giftProductLabel } from '@core/services/cart/cart-gifts';
import { cartLineKey, type CartLineDraft } from '@core/services/cart/cart.model';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import {
  dealTag,
  displayDecimals,
  toDisplayAmount,
  type BagDealHint,
} from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { OffersService } from '@core/services/offers/offers.service';
import { PRODUCT_GENDERS } from '@core/services/products/product.constants';
import type { Product, ProductGenderId } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import { DrawerService } from '@core/services/drawer/drawer.service';
import { SearchService, type SearchHit } from '@core/services/search';
import { ProductCardComponent } from '@shared/components/product-card/product-card.component';
import type { ProductCardData } from '@shared/components/product-card/product-card.model';
import {
  searchHitCardPrice,
  searchHitToCardData,
} from '@shared/components/product-card/product-card.utils';
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

interface CartProductInfo extends BagPricingProduct {
  readonly name: string;
  readonly slug: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly imagePath: string | null;
  readonly imageAlt: string;
  readonly options: Product['options'];
  /** Palette colour ids, so a free gift can be named with its colour. */
  readonly colors: readonly string[];
  /** "Men", "Women", "Kids" or "Unisex"; null when the product has no gender set. */
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
  readonly #auth = inject(AuthService);
  readonly #firestore = injectFirestore();
  readonly #isDesktop = useBreakpoint(1024);

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
    source: () =>
      this.productsResource.hasValue() ? this.productsResource.value() : undefined,
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
      const snap = await getDoc(
        doc(this.#firestore, 'products', productId).withConverter(converter),
      );
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
    const ctx = { now: this.#offers.now(), signedIn: Boolean(this.#auth.user()), codes: [] };
    return priceBag(this.lines(), this.#products(), offers, ctx);
  });

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
      const total = this.#lineDisplay(priced.unitEgp, priced.lineEgp, priced.deals.discount, line.quantity);
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
      if (priced) amount += this.#lineDisplay(priced.unitEgp, priced.lineEgp, priced.deals.discount, line.quantity);
    });
    return formatMoney(amount, entry.code, displayDecimals(entry.code));
  });

  /** Buy X Get Y nudges under each line ("Add 1 more to get 1 free", "You've earned a free grip"). */
  readonly #hintsByLine = computed(() => {
    const map = new Map<number, BagDealHint[]>();
    for (const hint of this.#pricedBag().hints) {
      map.set(hint.lineIndex, [...(map.get(hint.lineIndex) ?? []), hint]);
    }
    return map;
  });

  dealHints(index: number): readonly BagDealHint[] {
    return this.#hintsByLine().get(index) ?? [];
  }

  readonly dealHintText = dealHintText;

  /** Convert, then × quantity (as before); a line with a Buy X Get Y discount converts its total. */
  #lineDisplay(unitEgp: number, lineEgp: number, discount: number, quantity: number): number {
    const entry = this.#currency.entry();
    return discount > 0
      ? toDisplayAmount(lineEgp, entry)
      : lineDisplayAmount(toDisplayAmount(unitEgp, entry), quantity);
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

  selectionLabel(
    productId: string,
    selection: CartLineDraft['selection'],
  ): string {
    const info = this.productInfo(productId);
    const parts: string[] = [];
    for (const [key, valueId] of Object.entries(selection)) {
      const id = valueId.trim();
      if (!id) continue;
      const option = info?.options.find((item) => item.key === key);
      const valueLabel = option?.values.find((value) => value.id === id)?.label;
      // A choice the product no longer lists (or a product that has not loaded yet) is
      // left out, so an internal id never reaches the bag.
      if (valueLabel) parts.push(valueLabel);
    }
    return parts.join(' · ');
  }

  /** The free gifts picked for one line, each as "Free shirt: Adidas Simple Polo White, L". */
  giftRows(line: CartLineDraft, index: number): readonly CartGiftRow[] {
    const gifts = line.gifts ?? [];
    // Every piece has a Buy X Get Y discount instead, so none comes with gifts.
    if (gifts.length === 0 || this.linePrices()[index]?.giftUnits === 0) return [];
    const offers = this.#offers.all();
    return gifts.map((gift) => {
      const name = giftNameFor(offers, gift.offerId, gift.giftId);
      const info = this.productInfo(gift.productId);
      const size = info?.options
        .find((option) => option.key === 'size')
        ?.values.find((value) => value.id === gift.sizeId)?.label;
      return {
        key: `${gift.offerId}/${gift.giftId}`,
        label: info ? giftLineLabel(name, giftProductLabel(info), size ?? null) : name,
      };
    });
  }

  /** True once this copy of the bag has been on screen; recommendations load from then on. */
  readonly #shown = linkedSignal<boolean, boolean>({
    source: () =>
      this.drawerService.isOpen('cart') &&
      (this.placement() === 'side') === this.#isDesktop(),
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
      return this.#recommendationsResource.hasValue()
        ? this.#recommendationsResource.value()
        : undefined;
    },
    computation: (next, previous) =>
      next === undefined ? (previous?.value ?? null) : next,
  });

  /** Up to 4 in-stock products from the bag's categories that are not in the bag yet. */
  readonly recommendations = computed<readonly ProductCardData[]>(() => {
    const loaded = this.#recommendationHits();
    if (!loaded) return [];
    const inBag = new Set(this.lines().map((line) => line.productId));
    const hits = pickBagRecommendations(loaded.hits, inBag);
    const liveMode = this.#offers.ready() && !this.#offers.failed();
    const offers = liveMode ? this.#offers.all() : null;
    const ctx = { now: new Date(loaded.readAtMs), signedIn: Boolean(this.#auth.user()) };
    return hits.map((hit) => searchHitToCardData(hit, searchHitCardPrice(hit, offers, ctx)));
  });

  onEscape(): void {
    if (this.drawerService.isOpen('cart')) {
      this.drawerService.close();
    }
  }
}
