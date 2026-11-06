import { isPlatformBrowser } from '@angular/common';
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
import { lineDisplayAmount } from '@core/services/cart/cart-pricing';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import { isEgyptMobile } from '@core/config/order-messages';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { OffersService } from '@core/services/offers/offers.service';
import {
  displayDecimals,
  parcelWeight,
  planDelivery,
  priceItem,
  shippingQuote,
  type ParcelLine,
  toDisplayAmount,
  type PricedProduct,
  type PricingContext,
  type VariantFacts,
} from '@core/services/offers/engine';
import {
  CheckoutOrderService,
  type CheckoutPaymentMethod,
  type CheckoutShippingInput,
} from '@core/services/orders/checkout-order.service';
import type { Product, ProductVariant } from '@core/services/products/product.model';
import { ProductSchema } from '@core/services/products/product.schema';
import { toVariantFacts } from '@core/services/products/utils/priced-product.utils';
import { SeoService } from '@core/services/seo';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import { formatMoney } from '@shared/utils/money';
import {
  countryLabel,
  filterCheckoutCountries,
  isCheckoutCountry,
  matchCheckoutCountry,
  matchCheckoutCountryExact,
  type CheckoutCountryCode,
} from '../utils/checkout-countries';
import { SharedIconModule } from "@shared/ui/mat-icon";

const TOO_HEAVY_MESSAGE = 'This order is too heavy to send abroad. Remove an item or message us.';
const DELIVERY_UNAVAILABLE_MESSAGE =
  'We could not work out delivery for this order. Please try again later.';

interface CheckoutProductInfo {
  readonly name: string;
  readonly weightGrams: number | null;
  readonly priced: PricedProduct;
  readonly options: Product['options'];
  readonly variants: readonly ProductVariant[];
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
       * the delivery fee. Card or Wallet is hidden; `shipping` reads "To be agreed".
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
    };

@Component({
  selector: 'app-checkout-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    SharedIconModule,
  ],
  templateUrl: './checkout.page.html',
})
export class CheckoutPageComponent implements OnInit {
  readonly #cart = inject(CartService);
  readonly #checkout = inject(CheckoutOrderService);
  readonly #currency = inject(CurrencyService);
  readonly #firestore = injectFirestore();
  readonly #offers = inject(OffersService);
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #shippingSettings = inject(ShippingSettingsService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly isSubmitting = signal(false);
  /** What the shopper picked; null = not chosen yet (Egypt then starts on InstaPay). */
  readonly #chosenMethod = signal<CheckoutPaymentMethod | null>(null);
  /**
   * Egypt: InstaPay (default), card or wallet, or cash on delivery.
   * Abroad: card or wallet only, whatever was picked before.
   */
  readonly paymentMethod = computed<CheckoutPaymentMethod>(() => {
    if (!this.isEgypt()) return 'paymob';
    const chosen = this.#chosenMethod() ?? 'instapay';
    // A card can't be charged before the delivery fee of a large order is agreed.
    return chosen === 'paymob' && this.feeToBeAgreed() ? 'instapay' : chosen;
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

  readonly lines = this.#cart.lines;
  readonly isEmpty = this.#cart.isEmpty;
  readonly isEgypt = computed(() => this.shipping().country === 'EG');
  /** InstaPay and cash on delivery are Egypt-only. */
  readonly localMethodsAvailable = computed(() => this.isEgypt());

  readonly productsResource = resource({
    params: () => this.lines(),
    loader: async ({ params: lines }) => {
      if (!isPlatformBrowser(this.#platformId) || lines.length === 0) {
        return new Map<string, CheckoutProductInfo>();
      }
      const converter = createValibotConverter(ProductSchema);
      const products = new Map<string, CheckoutProductInfo>();
      const seen = new Set<string>();
      for (const line of lines) {
        if (seen.has(line.productId)) continue;
        seen.add(line.productId);
        const snap = await getDoc(
          doc(this.#firestore, 'products', line.productId).withConverter(converter),
        );
        if (snap.exists()) {
          const data = snap.data();
          products.set(line.productId, {
            name: data.name,
            weightGrams: typeof data.weightGrams === 'number' ? data.weightGrams : null,
            priced: toPricedProduct(data),
            options: data.options,
            variants: data.variants,
          });
        }
      }
      return products;
    },
  });

  /**
   * Display-only preview. Place-order ignores this and prices again on the server.
   * Shipping is one converted amount; the parcel itself stays off this screen.
   */
  readonly orderSummary = computed((): CheckoutSummary => {
    if (!isCheckoutCountry(this.shipping().country)) return { state: 'need-country' };
    if (!this.#currency.ready() || !this.#offers.ready()) return { state: 'loading' };
    if (this.productsResource.error()) return { state: 'unavailable' };
    const products = this.productsResource.value();
    const settings = this.#shippingSettings.settings();
    if (!products || !settings) return { state: 'loading' };

    const lines = this.lines();
    if (lines.some((line) => !products.has(line.productId))) return { state: 'missing-item' };

    const offers = this.#offers.all();
    const ctx: PricingContext = { now: new Date(), signedIn: true, codes: [] };
    const entry = this.#currency.entry();
    const pricedLines: PricedProduct[] = [];
    const parcelLines: ParcelLine[] = [];
    let subtotalEgp = 0;
    let subtotalDisplay = 0;

    for (const line of lines) {
      const info = products.get(line.productId);
      if (!info) return { state: 'missing-item' };
      parcelLines.push({ weightGrams: info.weightGrams, quantity: line.quantity });
      const unitEgp = priceItem(info.priced, variantFor(info, line), offers, ctx).effectivePrice;
      subtotalEgp += unitEgp * line.quantity;
      subtotalDisplay += lineDisplayAmount(toDisplayAmount(unitEgp, entry), line.quantity);
      pricedLines.push(info.priced);
    }

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
        shipping: 'To be agreed',
        total: `${formatMoney(subtotalDisplay, entry.code, decimals)} + shipping`,
        instapayTotal: formatMoney(subtotalEgp, 'EGP', 0),
        codShippingEgp: 0,
        codShipping: '',
        codCash: formatMoney(subtotalEgp, 'EGP', 0),
      };
    }

    let feeEgp: number;
    try {
      feeEgp = shippingQuote(
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
      ).fee;
    } catch {
      return { state: 'unavailable' };
    }

    const shippingDisplay = toDisplayAmount(feeEgp, entry);
    return {
      state: 'ready',
      feeToBeAgreed: false,
      subtotal: formatMoney(subtotalDisplay, entry.code, decimals),
      shipping: formatMoney(shippingDisplay, entry.code, decimals),
      total: formatMoney(subtotalDisplay + shippingDisplay, entry.code, decimals),
      instapayTotal: formatMoney(subtotalEgp + feeEgp, 'EGP', 0),
      codShippingEgp: feeEgp,
      codShipping: formatMoney(feeEgp, 'EGP', 0),
      codCash: formatMoney(subtotalEgp, 'EGP', 0),
    };
  });

  /** Large Egypt order: the delivery fee is agreed on WhatsApp after the order is placed. */
  readonly feeToBeAgreed = computed(() => {
    const summary = this.orderSummary();
    return summary.state === 'ready' && summary.feeToBeAgreed;
  });

  constructor() {
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
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Checkout | Atteya Store',
      description: 'Pay by Card or Wallet, or by InstaPay or Cash on Delivery in Egypt.',
      noindex: true,
    });
    if (this.isEmpty()) {
      void this.#router.navigateByUrl('/');
    }
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
    if (method === 'paymob' && this.feeToBeAgreed()) return;
    this.#chosenMethod.set(method);
  }

  productName(productId: string): string {
    return this.productsResource.value()?.get(productId)?.name ?? 'Item';
  }

  async placeOrder(): Promise<void> {
    if (this.isSubmitting() || this.isEmpty()) return;
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
    if (method !== 'paymob' && draft.country !== 'EG') {
      this.#snackbar.error('InstaPay and Cash on Delivery are only available for Egypt.');
      return;
    }

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
        });
        this.#cart.clear();
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
      });
      this.#cart.clear();
      await this.#router.navigate(['/checkout', 'confirmation', result.orderId], {
        state: { checkoutResult: result },
      });
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'We could not place your order. Try again in a moment.';
      this.#snackbar.error(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

/**
 * Preview twin of the server's selection match. `variantId` is accepted only
 * when it is the row the bag selection resolves to.
 */
function variantFor(info: CheckoutProductInfo, line: CartLineDraft): VariantFacts | null {
  if (info.variants.length > 0) {
    const matched = info.variants.find((item) =>
      Object.entries(item.values).every(([key, val]) => line.selection[key] === val),
    );
    if (!matched) return null;
    if (line.variantId != null && line.variantId !== matched.id) return null;
    return toVariantFacts(info, matched);
  }
  return variantFromSelection(info, line.selection);
}

function variantFromSelection(
  info: CheckoutProductInfo,
  selection: Readonly<Record<string, string>>,
): VariantFacts | null {
  const sizeId = selection['size'];
  const colourId = selection['colour'];
  if (!sizeId && !colourId) return null;
  const size = optionValue(info, 'size', sizeId);
  const colour = optionValue(info, 'colour', colourId);
  return {
    id: `${sizeId ?? 'any'}-${colourId ?? 'any'}`,
    size: size?.label ?? null,
    color: colour?.color ?? null,
  };
}

function optionValue(
  info: CheckoutProductInfo,
  key: 'size' | 'colour',
  valueId: string | undefined,
): Product['options'][number]['values'][number] | undefined {
  if (!valueId) return undefined;
  return info.options.find((option) => option.key === key)?.values.find((val) => val.id === valueId);
}
