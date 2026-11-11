import { isPlatformBrowser, NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { doc, getDoc } from 'firebase/firestore';
import { AuthService } from '@core/services/auth/auth.service';
import { isPermissionDenied } from '@core/services/auth/auth.utils';
import { lineDisplayAmount } from '@core/services/cart/cart-pricing';
import {
  dealOfferIdsOf,
  priceBag,
  shownLinePrices,
  type PricedBagLine,
} from '@core/services/cart/cart-deals';
import { giftNameFor, giftProductLabel } from '@core/services/cart/cart-gifts';
import { bagGiftKey, giftNoteText, unavailableGiftsMessage } from '@core/services/cart/bag-offer-notes';
import { BagOfferNotesService } from '@core/services/cart/bag-offer-notes.service';
import { bagOfferLook } from '@core/services/cart/bag-offer-state';
import { cartLineKey } from '@core/services/cart/cart.model';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import { isEgyptMobile } from '@core/config/order-messages';
import { isCardOrWalletLive, STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { OffersService } from '@core/services/offers/offers.service';
import {
  dealTag,
  displayDecimals,
  parcelWeight,
  planDelivery,
  shippingQuote,
  type ParcelLine,
  toDisplayAmount,
  type PricedProduct,
  type PricingContext,
} from '@core/services/offers/engine';
import {
  isFailedPrecondition,
  offerToLeaveOut,
  priceChangedFrom,
  serverClockFrom,
  serverTotalsToShow,
  type ServerTotals,
} from '@core/services/orders/order-refusal';
import {
  CheckoutOrderService,
  type CheckoutPaymentMethod,
  type CheckoutShippingInput,
  type ShownOrderTotals,
} from '@core/services/orders/checkout-order.service';
import type { Product, ProductVariant } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import { SeoService } from '@core/services/seo';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { UserProfileService, type SavedAddress } from '@core/services/user-profile';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { callableMessage } from '@shared/utils/firebase/firebase-errors';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import { cashOnDeliverySteps, instapaySteps } from '../utils/checkout-pay-steps';
import {
  countryLabel,
  filterCheckoutCountries,
  isCheckoutCountry,
  matchCheckoutCountry,
  matchCheckoutCountryExact,
  type CheckoutCountryCode,
} from '../utils/checkout-countries';
import { selectionLabel } from '../utils/checkout-line';
import { guestEmail } from '../utils/guest-email';
import { rememberGuestOrder } from '../utils/guest-order-storage';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { PaymentMarkComponent } from '@shared/ui/payment-mark';
import { BagOfferNotesComponent } from '@shared/components/bag-offer-notes/bag-offer-notes.component';

const TOO_HEAVY_MESSAGE = 'This order is too heavy to send abroad. Remove an item or message us.';
const ABROAD_COMING_SOON_MESSAGE =
  "Ordering from outside Egypt is coming soon. Message us on WhatsApp and we'll help you order.";
const DELIVERY_UNAVAILABLE_MESSAGE = 'We could not work out delivery for this order. Please try again later.';

/**
 * Product details by id. `null` = no longer available (deleted, or unpublished: shoppers get
 * permission-denied, admins see `published: false`).
 */
type CheckoutProducts = ReadonlyMap<string, CheckoutProductInfo | null>;

interface CheckoutProductInfo {
  readonly name: string;
  /** Main photo for the order summary (null when the product has none). */
  readonly imagePath: string | null;
  readonly imageAlt: string;
  readonly weightGrams: number | null;
  readonly priced: PricedProduct;
  readonly options: Product['options'];
  /** Palette colour ids, so a free gift can be named with its colour. */
  readonly colors: readonly string[];
  readonly variants: readonly ProductVariant[];
  /** Stock, to tell when a free gift can no longer be given. */
  readonly stock: number | null;
  readonly inStock: boolean;
  readonly stockBySize: Readonly<Record<string, number>> | null;
}

/** The bag priced in EGP and in the visitor's currency, before shipping. */
type PricedBag =
  | { readonly state: 'loading' }
  | { readonly state: 'missing-item' }
  | { readonly state: 'unavailable' }
  | {
      readonly state: 'ready';
      readonly offers: ReturnType<OffersService['all']>;
      readonly ctx: PricingContext;
      /** Line totals in the visitor's currency, in bag order; null for a line no longer available. */
      readonly lineDisplay: readonly (number | null)[];
      /** Each line priced in EGP with its Buy X Get Y discount, in bag order (null = gone). */
      readonly lines: readonly (PricedBagLine | null)[];
      readonly pricedLines: readonly PricedProduct[];
      readonly parcelLines: readonly ParcelLine[];
      readonly subtotalEgp: number;
      readonly subtotalDisplay: number;
      /** Picked free gifts that are gone or sold out right now (`bagGiftKey`): not given, not weighed. */
      readonly unavailableGifts: ReadonlySet<string>;
    };

/** One row of the order summary list. */
interface CheckoutSummaryItem {
  /** The product was deleted or unpublished: the row asks the shopper to remove it. */
  readonly unavailable: boolean;
  readonly name: string;
  /** Storage path of the main photo (the fallback source), or null. */
  readonly imagePath: string | null;
  /** The same photo as an ImageKit path for `ngSrc`. */
  readonly imageSrc: string;
  readonly imageAlt: string;
  /** Chosen options, e.g. "M · Black"; empty when the product has none. */
  readonly options: string;
  readonly quantity: number;
  /** Line total in the visitor's currency; empty while prices load. */
  readonly price: string;
  /** Buy X Get Y: the line before the discount (struck through) and its tag ("Free", "−50%"). */
  readonly was: string;
  readonly deal: string;
  /** Free gifts picked with the item, shown under it with their photo. */
  readonly gifts: readonly SummaryGift[];
  /** Free gifts that can no longer be given: "Your free shirt is no longer available." */
  readonly giftNotes: readonly string[];
}

/** One free gift under its item in the order summary. */
interface SummaryGift {
  readonly key: string;
  /** The gift's name from its offer ("Free shirt"), shown as the row's tag. */
  readonly tag: string;
  /** The product with its colour ("Adidas Simple Polo White"). */
  readonly name: string;
  /** "Size L", or empty when the gift has no size. */
  readonly details: string;
  readonly imagePath: string | null;
  readonly imageSrc: string;
}

type CheckoutSummary =
  | { readonly state: 'need-country' }
  | { readonly state: 'loading' }
  | { readonly state: 'missing-item' }
  | { readonly state: 'too-heavy' }
  | { readonly state: 'unavailable' }
  | {
      readonly state: 'ready';
      /**
       * Egypt order heavier than the biggest box: we message the shopper on WhatsApp to agree
       * the delivery fee. Card is hidden; `shipping` reads "We'll contact you".
       */
      readonly feeToBeAgreed: boolean;
      readonly subtotal: string;
      readonly shipping: string;
      readonly total: string;
      /** What an InstaPay order transfers, in EGP (same total the server saves). */
      readonly instapayTotal: string;
      /** Cash on delivery split in EGP (same as the order emails): fee first, rest at the door. */
      readonly codShippingEgp: number;
      readonly codShipping: string;
      readonly codCash: string;
      /**
       * The shipping fee and total (whole EGP) this summary shows, sent with the order so the
       * server refuses rather than charge more. Null while the fee is to be agreed.
       */
      readonly shown: ShownOrderTotals;
      /** The Free shipping offer that made shipping free, or null (for the bag's notes). */
      readonly freeShippingOfferId: string | null;
    };

@Component({
  selector: 'app-checkout-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    NgOptimizedImage,
    NgTemplateOutlet,
    AppImageFallbackDirective,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    SharedIconModule,
    PaymentMarkComponent,
    BagOfferNotesComponent,
  ],
  templateUrl: './checkout.page.html',
})
export class CheckoutPageComponent implements OnInit {
  readonly #auth = inject(AuthService);
  readonly #cart = inject(CartService);
  readonly #checkout = inject(CheckoutOrderService);
  readonly #currency = inject(CurrencyService);
  readonly #firestore = injectFirestore();
  readonly #offers = inject(OffersService);
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #shippingSettings = inject(ShippingSettingsService);
  readonly #snackbar = inject(SnackbarService);
  readonly #profiles = inject(UserProfileService);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #notes = inject(BagOfferNotesService);

  readonly isSubmitting = signal(false);
  /** Phone only: the order summary folds into a bar above the form until tapped. */
  readonly summaryOpen = signal(false);
  /** The signed-in shopper's email; empty for a guest. */
  readonly accountEmail = computed(() => this.#auth.user()?.email ?? '');
  /** Nobody is signed in: the shopper orders as a guest with the email they type. */
  readonly isGuest = computed(() => !this.#auth.isAuthenticated());
  /** The guest's email as typed (Delivery → Email). */
  readonly guestEmailInput = signal('');
  /**
   * Card can be picked (`STORE_INFO.payments.cardOrWallet`). While it is
   * `'coming-soon'` it is listed greyed out and visitors outside Egypt order on WhatsApp.
   */
  readonly cardOrWalletLive = isCardOrWalletLive();
  /** Business WhatsApp chat for visitors outside Egypt while Card is coming soon. */
  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);
  /** What the shopper picked; null = not chosen yet (Egypt then starts on InstaPay). */
  readonly #chosenMethod = signal<CheckoutPaymentMethod | null>(null);
  /**
   * Egypt: InstaPay (default), card, or cash on delivery.
   * Abroad: card only, whatever was picked before; null while Card is
   * coming soon (nothing to pay with, so checkout points to WhatsApp instead).
   */
  readonly paymentMethod = computed<CheckoutPaymentMethod | null>(() => {
    if (!this.isEgypt()) return this.cardOrWalletLive ? 'paymob' : null;
    const chosen = this.#chosenMethod() ?? 'instapay';
    if (chosen !== 'paymob') return chosen;
    // A card can't be charged before the delivery fee of a large order is agreed.
    return this.cardOrWalletLive && !this.feeToBeAgreed() ? 'paymob' : 'instapay';
  });
  /** True once the shopper edits the country field; blocks further geo overwrite. */
  readonly #countryTouched = signal(false);
  /** Last committed checkout country; blur restores this instead of leaving the field blank. */
  readonly #lastValidCountry = signal<CheckoutCountryCode>('EG');
  /** Typed filter text shown in the country autocomplete input. */
  readonly countryQuery = signal('');
  /** Blur commit waits until the autocomplete panel closes so option taps win. */
  readonly #countryBlurCommitPending = signal(false);
  readonly #countryPanelOpen = signal(false);
  readonly #countryOptionActivating = signal(false);
  readonly displayCountryLabel = (code: string): string => (code ? countryLabel(code) : '');

  readonly shipping = signal<CheckoutShippingInput>({
    fullName: '',
    line1: '',
    line2: null,
    city: '',
    region: null,
    postalCode: '',
    country: '',
    phone: '',
    governorateId: null,
  });

  readonly filteredCountries = computed(() => filterCheckoutCountries(this.countryQuery()));

  /**
   * The shopper's saved address (Account → Delivery Address). Read once; checkout fills the
   * form with it when its country matches and never saves over it. A failed read just leaves
   * the form empty.
   */
  readonly #savedAddress = resource({
    params: () => this.#auth.user()?.uid || undefined,
    loader: async ({ params: uid }) => (await this.#profiles.get(uid))?.address ?? null,
  });
  #savedAddressFilled = false;

  readonly lines = this.#cart.lines;
  readonly isEmpty = this.#cart.isEmpty;
  readonly isEgypt = computed(() => this.shipping().country === 'EG');
  /** InstaPay and cash on delivery are Egypt-only. */
  readonly localMethodsAvailable = computed(() => this.isEgypt());
  /** A country outside Egypt is chosen while Card is coming soon: order on WhatsApp. */
  readonly abroadOrderingClosed = computed(() => {
    const country = this.shipping().country;
    return !this.cardOrWalletLive && isCheckoutCountry(country) && country !== 'EG';
  });

  readonly productsResource = resource({
    params: () => this.lines(),
    loader: async ({ params: lines }): Promise<CheckoutProducts> => {
      if (!isPlatformBrowser(this.#platformId) || lines.length === 0) {
        return new Map<string, CheckoutProductInfo | null>();
      }
      const ids = [...new Set(lines.map((line) => line.productId))];
      // Free gift products are read like the items: what a gift is worth decides between it and a
      // Buy X Get Y discount, so one that can't be read stops the summary instead of guessing.
      // A gone or unpublished gift reads as `null` (worth 0, as the server counts it).
      const giftIds = [
        ...new Set(lines.flatMap((line) => (line.gifts ?? []).map((gift) => gift.productId))),
      ].filter((id) => !ids.includes(id));
      const allIds = [...ids, ...giftIds];
      const loaded = await Promise.all(allIds.map((id) => this.#readProduct(id)));
      return new Map<string, CheckoutProductInfo | null>(allIds.map((id, index) => [id, loaded[index]!]));
    },
  });

  /**
   * Reads one product. A deleted or unpublished product comes back as `null`, so one gone
   * item never hides the rest of the order summary. Any other failure (offline, a doc that
   * fails `ProductSchema`) still throws, because the bag can't be priced without it.
   */
  async #readProduct(productId: string): Promise<CheckoutProductInfo | null> {
    const converter = createValibotConverter(ProductSchema);
    let snap;
    try {
      snap = await getDoc(doc(this.#firestore, 'products', productId).withConverter(converter));
    } catch (error) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data.published) return null;
    const photo = data.images[0];
    return {
      name: data.name,
      imagePath: photo?.path ?? null,
      imageAlt: photo?.alt || data.name,
      weightGrams: typeof data.weightGrams === 'number' ? data.weightGrams : null,
      priced: toPricedProduct(data),
      options: data.options,
      colors: data.colors,
      variants: data.variants,
      stock: typeof data.stock === 'number' ? data.stock : null,
      inStock: data.inStock,
      stockBySize: data.stockBySize ?? null,
    };
  }

  /** How many bag lines are for products that are no longer available. */
  readonly unavailableLineCount = computed(() => {
    const products = this.productsResource.hasValue() ? this.productsResource.value() : undefined;
    if (!products) return 0;
    return this.lines().filter((line) => products.get(line.productId) === null).length;
  });

  /**
   * Shown next to Place Order (and as the snackbar) while the bag holds a gone item, or a free
   * gift that is gone or sold out (counted, same wording as the order callables for one).
   */
  readonly unavailableMessage = computed((): string | null => {
    const count = this.unavailableLineCount();
    if (count === 0) {
      const bag = this.#pricedBag();
      return bag.state === 'ready' ? unavailableGiftsMessage(bag.unavailableGifts.size) : null;
    }
    return count === 1
      ? 'One item in your bag is no longer available. Remove it to place your order.'
      : 'Some items in your bag are no longer available. Remove them to place your order.';
  });

  /**
   * Bag lines priced with live offers (EGP and the visitor's currency). Shipping is added in
   * `orderSummary`. Display-only: place-order prices again on the server.
   */
  readonly #pricedBag = computed((): PricedBag => {
    if (!this.#currency.ready() || !this.#offers.ready()) return { state: 'loading' };
    if (this.productsResource.error()) return { state: 'unavailable' };
    const products = this.productsResource.value();
    if (!products) return { state: 'loading' };

    const lines = this.lines();
    // Empty bag: nothing to price, and no item is missing (the page sends the shopper home).
    if (lines.length === 0) return { state: 'loading' };
    if (lines.some((line) => !products.has(line.productId))) return { state: 'missing-item' };

    const offers = this.#offers.all();
    // The offer clock moves every minute, so an offer whose time is up stops discounting here too.
    // A guest is priced as signed out, like the server: no signed-in-only or once-per-customer offers.
    const ctx: PricingContext = {
      now: this.#offers.now(),
      signedIn: this.#auth.isAuthenticated(),
      codes: [],
    };
    const entry = this.#currency.entry();
    // Per-item offers on each piece, then Buy X Get Y over the whole bag, like the server.
    const bag = priceBag(lines, products, offers, ctx);
    // Which picked gifts can be given right now, with the same checks as the order callables.
    const giftLook = bagOfferLook({ bagKey: '', lines, products, priced: bag.lines, offers, ctx });
    const givenGifts = giftLook?.state.gifts ?? new Map();
    const unavailableGifts = new Set(giftLook?.state.unavailableGifts?.keys() ?? []);
    const lineDisplay: (number | null)[] = [];
    const pricedLines: PricedProduct[] = [];
    const parcelLines: ParcelLine[] = [];
    let subtotalEgp = 0;
    let subtotalDisplay = 0;

    for (const [index, line] of lines.entries()) {
      const info = products.get(line.productId);
      if (info === undefined) return { state: 'missing-item' };
      const priced = bag.lines[index];
      // No longer available: shown with a remove button and left out of the totals.
      if (info === null || !priced) {
        lineDisplay.push(null);
        continue;
      }
      parcelLines.push({ weightGrams: info.weightGrams, quantity: line.quantity });
      // Each free gift goes in the same parcel (one per piece without a Buy X Get Y discount),
      // as the server weighs it. A gift that can't be given (gone, sold out) is left out.
      const lineKey = cartLineKey(line);
      for (const gift of line.gifts ?? []) {
        if (!givenGifts.has(bagGiftKey(lineKey, gift.offerId, gift.giftId))) continue;
        parcelLines.push({
          weightGrams: products.get(gift.productId)?.weightGrams ?? null,
          quantity: priced.deals.giftUnits,
        });
      }
      const display =
        priced.deals.dealUnits > 0
          ? toDisplayAmount(priced.lineEgp, entry)
          : lineDisplayAmount(toDisplayAmount(priced.unitEgp, entry), line.quantity);
      subtotalEgp += priced.lineEgp;
      subtotalDisplay += display;
      lineDisplay.push(display);
      pricedLines.push(info.priced);
    }
    // Every item is gone: nothing left to price.
    if (pricedLines.length === 0) return { state: 'missing-item' };

    return {
      state: 'ready',
      offers,
      ctx,
      lineDisplay,
      lines: bag.lines,
      pricedLines,
      parcelLines,
      subtotalEgp,
      subtotalDisplay,
      unavailableGifts,
    };
  });

  /** Order summary rows: photo, name, options, quantity and line price. */
  readonly summaryItems = computed((): readonly CheckoutSummaryItem[] => {
    const products = this.productsResource.hasValue() ? this.productsResource.value() : undefined;
    const bag = this.#pricedBag();
    const entry = this.#currency.entry();
    const decimals = displayDecimals(entry.code);
    const offers = this.#offers.all();
    const giftNotes = new Map(this.#notes.giftNotes().map((note) => [note.key, note]));
    return this.lines().map((line, index) => {
      const info = products?.get(line.productId);
      if (info === null) {
        return {
          unavailable: true,
          name: 'No longer available',
          imagePath: null,
          imageSrc: '',
          imageAlt: '',
          options: '',
          quantity: line.quantity,
          price: '',
          was: '',
          deal: '',
          gifts: [],
          giftNotes: [],
        };
      }
      const display = bag.state === 'ready' ? bag.lineDisplay[index] : null;
      const priced = bag.state === 'ready' ? bag.lines[index] : null;
      const deal = priced && priced.deals.discount > 0 ? priced : null;
      // A piece with a Buy X Get Y discount comes without its free gifts.
      const giftUnits = priced ? priced.deals.giftUnits : line.quantity;
      // A gift that can no longer be given shows its note instead of its row. One that is gone or
      // sold out right now is never listed as given, even before its note is in.
      const lineKey = cartLineKey(line);
      const noted = (gift: { offerId: string; giftId: string }): boolean =>
        giftNotes.has(bagGiftKey(lineKey, gift.offerId, gift.giftId));
      const unavailable = (gift: { offerId: string; giftId: string }): boolean =>
        bag.state === 'ready' && bag.unavailableGifts.has(bagGiftKey(lineKey, gift.offerId, gift.giftId));
      const lineGifts = (giftUnits > 0 ? (line.gifts ?? []) : []).filter(
        (gift) => !noted(gift) && !unavailable(gift),
      );
      return {
        unavailable: false,
        name: info?.name ?? 'Item',
        imagePath: info?.imagePath ?? null,
        imageSrc: info?.imagePath ? normalizeImageKitPath(info.imagePath) : '',
        imageAlt: info?.imageAlt ?? '',
        options: info ? selectionLabel(info.options, line.selection) : '',
        quantity: line.quantity,
        price: display == null ? '' : formatMoney(display, entry.code, decimals),
        // The line before its Buy X Get Y discount: pieces in a group at the price before per-item offers.
        was: deal ? formatMoney(toDisplayAmount(deal.fullEgp, entry), entry.code, decimals) : '',
        deal: deal ? dealTag(deal.deals.deals, line.quantity) : '',
        giftNotes: (line.gifts ?? [])
          .filter(noted)
          .map((gift) => giftNoteText(giftNotes.get(bagGiftKey(lineKey, gift.offerId, gift.giftId))!.name)),
        gifts: lineGifts.map((gift) => {
          const name = giftNameFor(offers, gift.offerId, gift.giftId);
          const giftInfo = products?.get(gift.productId);
          const size = giftInfo?.options
            .find((option) => option.key === 'size')
            ?.values.find((value) => value.id === gift.sizeId)?.label;
          const imagePath = giftInfo?.imagePath ?? null;
          return {
            key: `${gift.offerId}/${gift.giftId}`,
            tag: name,
            name: giftInfo ? giftProductLabel(giftInfo) : name,
            details: size ? `Size ${size}` : '',
            imagePath,
            imageSrc: imagePath ? normalizeImageKitPath(imagePath) : '',
          };
        }),
      };
    });
  });

  /**
   * Display-only preview. Place-order ignores this and prices again on the server.
   * Shipping is one converted amount; the parcel itself stays off this screen.
   */
  readonly orderSummary = computed((): CheckoutSummary => {
    if (!isCheckoutCountry(this.shipping().country)) return { state: 'need-country' };
    const bag = this.#pricedBag();
    if (bag.state !== 'ready') return { state: bag.state };
    const settings = this.#shippingSettings.settings();
    if (!settings) return { state: 'loading' };

    const { offers, ctx, pricedLines, parcelLines, subtotalEgp, subtotalDisplay } = bag;
    const entry = this.#currency.entry();

    const region = this.isEgypt() ? 'egypt' : 'international';
    const boxes = this.isEgypt() ? settings.egyptBoxes : settings.internationalBoxes;
    const plan = planDelivery(boxes, region, parcelWeight(parcelLines));
    if (plan.kind === 'too-heavy') return { state: 'too-heavy' };
    if (plan.kind === 'unavailable') return { state: 'unavailable' };

    const decimals = displayDecimals(entry.code);
    if (plan.kind === 'to-be-agreed') {
      return {
        state: 'ready',
        feeToBeAgreed: true,
        subtotal: formatMoney(subtotalDisplay, entry.code, decimals),
        shipping: "We'll contact you",
        total: `${formatMoney(subtotalDisplay, entry.code, decimals)} + shipping`,
        instapayTotal: formatMoney(subtotalEgp, 'EGP', 0),
        codShippingEgp: 0,
        codShipping: '',
        codCash: formatMoney(subtotalEgp, 'EGP', 0),
        shown: { shippingEgp: null, totalEgp: null },
        freeShippingOfferId: null,
      };
    }

    let feeEgp: number;
    let freeShippingOfferId: string | null;
    try {
      const quote = shippingQuote(
        settings,
        {
          region,
          boxId: plan.box.id,
          totalWeightGrams: plan.quoteWeightGrams,
          goodsSubtotal: subtotalEgp,
          lines: pricedLines,
        },
        offers,
        ctx,
      );
      feeEgp = quote.fee;
      // Same test as the order callables (`freeShippingOfferIdOf`): the offer made shipping free.
      const madeItFree = quote.reason === 'offer' && quote.fee === 0 && Math.round(quote.box.feeEgp) > 0;
      freeShippingOfferId = madeItFree ? (quote.offerId ?? null) : null;
    } catch {
      return { state: 'unavailable' };
    }

    // The server refused this same shipping fee and total twice in a row with its own figures:
    // show those, so the shopper sees what the order costs (see `placeOrder`).
    const server = this.#serverTotals();
    if (server && server.forShippingEgp === feeEgp && server.forTotalEgp === subtotalEgp + feeEgp) {
      const serverSubtotalEgp = server.totalEgp - server.shippingEgp;
      const serverSubtotalDisplay = toDisplayAmount(serverSubtotalEgp, entry);
      const serverShippingDisplay = toDisplayAmount(server.shippingEgp, entry);
      return {
        state: 'ready',
        feeToBeAgreed: false,
        subtotal: formatMoney(serverSubtotalDisplay, entry.code, decimals),
        shipping:
          server.shippingEgp === 0 ? 'Free' : formatMoney(serverShippingDisplay, entry.code, decimals),
        total: formatMoney(serverSubtotalDisplay + serverShippingDisplay, entry.code, decimals),
        instapayTotal: formatMoney(server.totalEgp, 'EGP', 0),
        codShippingEgp: server.shippingEgp,
        codShipping: formatMoney(server.shippingEgp, 'EGP', 0),
        codCash: formatMoney(serverSubtotalEgp, 'EGP', 0),
        shown: { shippingEgp: server.shippingEgp, totalEgp: server.totalEgp },
        freeShippingOfferId,
      };
    }

    const shippingDisplay = toDisplayAmount(feeEgp, entry);
    return {
      state: 'ready',
      feeToBeAgreed: false,
      subtotal: formatMoney(subtotalDisplay, entry.code, decimals),
      shipping: feeEgp === 0 ? 'Free' : formatMoney(shippingDisplay, entry.code, decimals),
      total: formatMoney(subtotalDisplay + shippingDisplay, entry.code, decimals),
      instapayTotal: formatMoney(subtotalEgp + feeEgp, 'EGP', 0),
      codShippingEgp: feeEgp,
      codShipping: formatMoney(feeEgp, 'EGP', 0),
      codCash: formatMoney(subtotalEgp, 'EGP', 0),
      shown: { shippingEgp: feeEgp, totalEgp: subtotalEgp + feeEgp },
      freeShippingOfferId,
    };
  });

  /**
   * What the bag gets from offers right now (item offers, Buy X Get Y and Free shipping), for the
   * notes that say when one stops applying (`BagOfferNotesService`); null while anything loads.
   */
  readonly #offerLook = computed(() => {
    const bag = this.#pricedBag();
    if (bag.state !== 'ready' || this.#offers.failed()) return null;
    const products = this.productsResource.value();
    if (!products) return null;
    const summary = this.orderSummary();
    const freeShippingOfferId = summary.state === 'ready' ? summary.freeShippingOfferId : null;
    return bagOfferLook({
      bagKey: this.#notes.bagKey(),
      lines: this.lines(),
      products,
      priced: bag.lines,
      offers: bag.offers,
      ctx: bag.ctx,
      extraOfferIds: freeShippingOfferId ? [freeShippingOfferId] : [],
    });
  });

  /** What the phone summary bar shows: the total once shipping is known, else the subtotal. */
  readonly summaryBarAmount = computed(() => {
    const summary = this.orderSummary();
    if (summary.state === 'ready') return summary.total;
    const bag = this.#pricedBag();
    if (bag.state !== 'ready') return '';
    const entry = this.#currency.entry();
    return formatMoney(bag.subtotalDisplay, entry.code, displayDecimals(entry.code));
  });

  /** Large Egypt order: the delivery fee is agreed on WhatsApp after the order is placed. */
  readonly feeToBeAgreed = computed(() => {
    const summary = this.orderSummary();
    return summary.state === 'ready' && summary.feeToBeAgreed;
  });

  /** The priced summary once it is ready (amounts for the payment steps), otherwise null. */
  readonly readySummary = computed(() => {
    const summary = this.orderSummary();
    return summary.state === 'ready' ? summary : null;
  });

  /** How to pay, step by step, under the chosen method (empty until the bag is priced). */
  readonly instapaySteps = computed(() => {
    const ready = this.readySummary();
    return ready ? instapaySteps(ready) : [];
  });

  readonly cashOnDeliverySteps = computed(() => {
    const ready = this.readySummary();
    return ready ? cashOnDeliverySteps(ready) : [];
  });

  constructor() {
    // Tell the shopper when an offer stops applying to their bag (notes above the summary).
    effect(() => {
      const look = this.#offerLook();
      if (look && isPlatformBrowser(this.#platformId)) untracked(() => this.#notes.observe('checkout', look));
    });

    // Prefill from AS-21 visitor geo when the code is on the checkout list.
    // Localhost has no CDN headers and a private IP, so /api/visitor-location
    // returns null — fall back to EG (store home market) once currency has settled.
    // Africa/Cairo timezone is not wired into visitorCountry (deprecated currency path).
    effect(() => {
      if (this.#countryTouched()) return;
      const geo = this.#currency.visitorCountry();
      const ready = this.#currency.ready();
      const code = geo && isCheckoutCountry(geo) ? geo : ready ? 'EG' : null;
      if (!code) return;
      untracked(() => {
        const label = countryLabel(code);
        if (this.shipping().country !== code) {
          this.patchShipping('country', code);
        }
        // Keep the input label in sync even when the control already holds the code
        // (avoids empty display while shipping.country is EG).
        if (this.countryQuery() !== label) {
          this.countryQuery.set(label);
        }
      });
    });
    // Fill in the saved address once, when it is for the delivery country and the shopper
    // hasn't started typing an address.
    effect(() => {
      if (this.#savedAddressFilled || !this.#savedAddress.hasValue()) return;
      const saved = this.#savedAddress.value();
      const country = this.shipping().country;
      if (!saved || saved.country !== country) return;
      untracked(() => {
        this.#savedAddressFilled = true;
        if (hasTypedAddress(this.shipping())) return;
        this.shipping.update((current) => fillFromSavedAddress(current, saved));
      });
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Checkout | Atteya Store',
      description: this.cardOrWalletLive
        ? 'Pay by Card, or by InstaPay or Cash on Delivery in Egypt.'
        : 'Pay by InstaPay or Cash on Delivery in Egypt.',
      noindex: true,
    });
    // A signed-in shopper's bag loads from their account, so wait for it before leaving an empty checkout.
    void this.#cart.waitUntilReady().then(() => {
      if (this.isEmpty() && this.#router.url.split(/[?#]/)[0] === '/checkout') {
        void this.#router.navigateByUrl('/');
      }
    });
  }

  patchShipping<K extends keyof CheckoutShippingInput>(key: K, value: CheckoutShippingInput[K]): void {
    this.shipping.update((current) => {
      const next = { ...current, [key]: value };
      if (key === 'country' && typeof value === 'string' && isCheckoutCountry(value)) {
        this.#lastValidCountry.set(value);
      }
      if (key === 'country' && value !== 'EG') {
        next.governorateId = null;
      }
      return next;
    });
  }

  onCountryQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    // Empty autofill/noise before geo settle must not clear or block prefill.
    if (value.length === 0 && !this.#currency.ready()) {
      return;
    }
    this.#countryTouched.set(true);
    this.countryQuery.set(value);
    const matched = matchCheckoutCountryExact(value);
    // Only commit an exact match while typing. Do not clear the stored country
    // on every keystroke — blur can race ahead of mat-option clicks.
    if (matched) {
      this.patchShipping('country', matched);
    }
  }

  onCountrySelected(event: MatAutocompleteSelectedEvent): void {
    this.#countryTouched.set(true);
    this.#countryBlurCommitPending.set(false);
    this.#countryOptionActivating.set(false);
    const code = String(event.option.value);
    if (!isCheckoutCountry(code)) return;
    this.patchShipping('country', code);
    this.countryQuery.set(countryLabel(code));
  }

  onCountryAutocompleteOpened(): void {
    this.#countryPanelOpen.set(true);
  }

  onCountryAutocompleteClosed(): void {
    this.#countryPanelOpen.set(false);
    // Run after optionSelected in the same turn when the shopper picked from the list.
    setTimeout(() => {
      this.#countryOptionActivating.set(false);
      this.#flushCountryBlurCommit();
    }, 0);
  }

  onCountryOptionActivate(): void {
    this.#countryOptionActivating.set(true);
  }

  onCountryBlur(): void {
    this.#countryBlurCommitPending.set(true);
    this.#flushCountryBlurCommit();
  }

  #flushCountryBlurCommit(): void {
    if (!this.#countryBlurCommitPending()) return;
    if (this.#countryPanelOpen() || this.#countryOptionActivating()) return;
    this.#countryBlurCommitPending.set(false);
    this.#commitCountryFromQuery();
  }

  #commitCountryFromQuery(): void {
    const selected = this.shipping().country;
    const query = this.countryQuery().trim();
    if (!query) {
      this.#restoreLastValidCountry();
      return;
    }
    if (selected && isCheckoutCountry(selected) && countryLabel(selected) === query) {
      this.countryQuery.set(countryLabel(selected));
      return;
    }
    const matched = matchCheckoutCountry(query) ?? matchCheckoutCountryExact(query);
    if (matched) {
      this.patchShipping('country', matched);
      this.countryQuery.set(countryLabel(matched));
      return;
    }
    // Keep a still-valid selected country if the typed text is only a prefix filter.
    if (selected && isCheckoutCountry(selected) && query.length > 0) {
      const label = countryLabel(selected);
      if (label.toLowerCase().startsWith(query.toLowerCase())) {
        this.countryQuery.set(label);
        return;
      }
    }
    this.#restoreLastValidCountry();
  }

  #restoreLastValidCountry(): void {
    const fallback = this.#lastValidCountry();
    const code = isCheckoutCountry(fallback) ? fallback : 'EG';
    if (this.shipping().country !== code) {
      this.patchShipping('country', code);
    }
    this.countryQuery.set(countryLabel(code));
  }

  setPaymentMethod(method: CheckoutPaymentMethod): void {
    if (method !== 'paymob' && !this.localMethodsAvailable()) return;
    if (method === 'paymob' && (!this.cardOrWalletLive || this.feeToBeAgreed())) return;
    this.#chosenMethod.set(method);
  }

  /** Removes a bag line from the order summary (used for items no longer available). */
  removeLine(index: number): void {
    this.#cart.removeAt(index);
    // Removing the last line leaves nothing to check out: send the shopper home.
    if (this.isEmpty() && this.#router.url.split(/[?#]/)[0] === '/checkout') {
      void this.#router.navigateByUrl('/');
    }
  }

  toggleSummary(): void {
    this.summaryOpen.update((open) => !open);
  }

  /** The offer of the last "Prices in your bag changed" refusal on this visit (see `placeOrder`). */
  #lastChangedOfferId: string | null = null;
  /** The server totals of the last shipping or total refusal on this visit (see `placeOrder`). */
  #lastServerTotals: ServerTotals | null = null;
  /**
   * The server's shipping fee and total after the same ones were refused twice in a row, with the
   * figures this summary showed then (`for…`): shown while the summary's own figures stay the same.
   */
  readonly #serverTotals = signal<
    (ServerTotals & { readonly forShippingEgp: number; readonly forTotalEgp: number }) | null
  >(null);

  async placeOrder(): Promise<void> {
    if (this.isSubmitting() || this.isEmpty()) return;
    if (this.abroadOrderingClosed()) {
      this.#snackbar.error(ABROAD_COMING_SOON_MESSAGE);
      return;
    }
    // A guest orders with an email (the order emails and the order link go there).
    const guest = this.isGuest() ? guestEmail(this.guestEmailInput()) : null;
    if (this.isGuest() && !guest) {
      this.#snackbar.error(
        this.guestEmailInput().trim() ? 'Check your email address.' : 'Enter your email to place your order.',
      );
      return;
    }
    const draft = this.shipping();
    if (!draft.fullName.trim() || !draft.line1.trim() || !draft.city.trim()) {
      this.#snackbar.error('Fill in your delivery address to continue.');
      return;
    }
    if (draft.country !== 'EG' && !draft.postalCode.trim()) {
      this.#snackbar.error('Enter your postal code to continue.');
      return;
    }
    if (!isCheckoutCountry(draft.country)) {
      this.#snackbar.error('Choose a delivery country from the list.');
      return;
    }
    if (!draft.phone.trim()) {
      this.#snackbar.error('Add a phone number we can reach you on.');
      return;
    }
    // We reach Egypt shoppers on WhatsApp (InstaPay screenshot, cash-on-delivery fee).
    if (draft.country === 'EG' && !isEgyptMobile(draft.phone)) {
      this.#snackbar.error('Enter an Egyptian mobile number, e.g. 010 1234 5678.');
      return;
    }
    const unavailable = this.unavailableMessage();
    if (unavailable) {
      this.#snackbar.error(unavailable);
      return;
    }
    const summary = this.orderSummary();
    if (summary.state === 'too-heavy') {
      this.#snackbar.error(TOO_HEAVY_MESSAGE);
      return;
    }
    if (summary.state === 'missing-item') {
      this.#snackbar.error('One item in your bag is no longer available.');
      return;
    }
    if (summary.state === 'unavailable') {
      this.#snackbar.error(DELIVERY_UNAVAILABLE_MESSAGE);
      return;
    }
    if (summary.state !== 'ready') {
      this.#snackbar.error('Wait a moment while we work out shipping.');
      return;
    }
    const method = this.paymentMethod();
    if (method === null) {
      this.#snackbar.error(ABROAD_COMING_SOON_MESSAGE);
      return;
    }
    if (method !== 'paymob' && draft.country !== 'EG') {
      this.#snackbar.error('InstaPay and Cash on Delivery are only available for Egypt.');
      return;
    }

    // The Buy X Get Y offers this summary shows, and each line's price per piece with its offer:
    // the server refuses rather than charge more than this summary shows.
    const priced = this.#pricedBag();
    const dealOfferIds = priced.state === 'ready' ? dealOfferIdsOf(priced.lines) : [];
    const shownPrices = priced.state === 'ready' ? shownLinePrices(priced.lines) : [];
    // The shipping fee and total this summary shows: the server refuses rather than charge more.
    const shownTotals = summary.shown;

    this.isSubmitting.set(true);
    try {
      const shipping: CheckoutShippingInput = {
        fullName: draft.fullName.trim(),
        line1: draft.line1.trim(),
        line2: draft.country === 'EG' ? null : draft.line2?.trim() || null,
        city: draft.city.trim(),
        region: draft.country === 'EG' ? null : draft.region?.trim() || null,
        postalCode: draft.country === 'EG' ? '' : draft.postalCode.trim(),
        country: draft.country,
        phone: draft.phone.trim(),
        governorateId: null,
      };

      if (method === 'paymob') {
        const result = await this.#checkout.placePaymobOrder({
          lines: this.lines(),
          shipping,
          endedOfferIds: this.#offers.endedIds(),
          dealOfferIds,
          shownPrices,
          shownTotals,
          guest: guest ? { email: guest } : null,
        });
        if (guest) rememberGuestOrder(result.orderId, { key: result.viewKey ?? null, email: guest });
        // Wait for the account bag to save before the full-page redirect to Paymob.
        await this.#cart.clear();
        if (isPlatformBrowser(this.#platformId)) {
          window.location.assign(result.checkoutUrl);
          return;
        }
        await this.#router.navigate(['/checkout', 'confirmation', result.orderId]);
        return;
      }

      const result = await this.#checkout.placeManualOrder({
        method,
        lines: this.lines(),
        shipping,
        endedOfferIds: this.#offers.endedIds(),
        dealOfferIds,
        shownPrices,
        shownTotals,
        guest: guest ? { email: guest } : null,
      });
      const viewKey = guest ? (result.viewKey ?? null) : null;
      if (guest) rememberGuestOrder(result.orderId, { key: viewKey, email: guest });
      void this.#cart.clear();
      // A guest's order page reads the order by its key (`?key=`); the page keeps it and hides it.
      await this.#router.navigate(['/checkout', 'confirmation', result.orderId], {
        state: { checkoutResult: result },
        ...(viewKey ? { queryParams: { key: viewKey } } : {}),
      });
    } catch (error: unknown) {
      // An offer in the bag has ended for this shopper (`endedOfferId`): leave it out of the bag and
      // the summary for the rest of the visit, so they see the new total and place the order again
      // at it. "Prices in your bag changed" (`changedOfferId`) only shows the message the first
      // time (the live offers listener brings the bag up to date); the same offer refused twice in
      // a row is left out too, so Place Order never fails forever. The same goes for a Percent off,
      // Amount off or Set price offer whose price changed. When the line had no offer, the product
      // price itself went up: read the products again so the summary shows the new price.
      const next = offerToLeaveOut(error, this.#lastChangedOfferId);
      this.#lastChangedOfferId = next.lastChangedOfferId;
      if (next.leaveOut) this.#offers.markEnded(next.leaveOut, next.reason);
      // Read the products again after any refusal about the bag (a price went up, or a free gift
      // sold out), so the summary and its notes show what changed.
      if (priceChangedFrom(error) || isFailedPrecondition(error)) this.productsResource.reload();
      // The shipping fee or total came out higher than this summary showed (a lower price dropped
      // the bag under free shipping, a Buy X Get Y discount shrank): price offers on the server's
      // clock from now on and read the products again (above). When the same server totals come
      // back twice in a row, the summary shows them, so Place Order never fails forever.
      const serverNowMs = serverClockFrom(error);
      if (serverNowMs !== null) this.#offers.syncClock(serverNowMs);
      const totals = serverTotalsToShow(error, this.#lastServerTotals);
      this.#lastServerTotals = totals.last;
      if (totals.show && shownTotals.shippingEgp !== null && shownTotals.totalEgp !== null) {
        // Keyed on the summary's own figures, also when it was already showing server totals.
        const current = this.#serverTotals();
        const showingServer =
          current !== null &&
          current.shippingEgp === shownTotals.shippingEgp &&
          current.totalEgp === shownTotals.totalEgp;
        this.#serverTotals.set({
          ...totals.show,
          forShippingEgp: showingServer ? current.forShippingEgp : shownTotals.shippingEgp,
          forTotalEgp: showingServer ? current.forTotalEgp : shownTotals.totalEgp,
        });
      }
      this.#snackbar.error(callableMessage(error) ?? 'We could not place your order. Try again in a moment.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

function hasTypedAddress(shipping: CheckoutShippingInput): boolean {
  return [
    shipping.fullName,
    shipping.line1,
    shipping.line2 ?? '',
    shipping.city,
    shipping.region ?? '',
    shipping.postalCode,
    shipping.phone,
  ].some((value) => value.trim().length > 0);
}

/** Saved address → checkout form (same country). Egypt keeps only its four fields. */
function fillFromSavedAddress(current: CheckoutShippingInput, saved: SavedAddress): CheckoutShippingInput {
  const isEgypt = saved.country === 'EG';
  return {
    ...current,
    fullName: saved.fullName,
    line1: saved.line1,
    line2: isEgypt ? null : (saved.line2 ?? null),
    city: saved.city,
    region: isEgypt ? null : (saved.region ?? null),
    postalCode: isEgypt ? '' : saved.postalCode,
    phone: saved.phone,
  };
}
