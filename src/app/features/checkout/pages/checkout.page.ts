import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
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
import { MatSelectModule } from '@angular/material/select';
import { resource } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { injectFirestore } from '@core/firebase';
import {
  EGYPT_GOVERNORATES,
  selectShippingBox,
  sortedBoxes,
  type ShippingBox,
  type ShippingBoxId,
} from '@core/services/offers/engine';
import {
  CheckoutOrderService,
  type CheckoutPaymentMethod,
  type CheckoutShippingInput,
} from '@core/services/orders/checkout-order.service';
import { ProductSchema } from '@core/services/products/product.schema';
import { SeoService } from '@core/services/seo';
import { ShippingSettingsService } from '@core/services/shipping/shipping-settings.service';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { createValibotConverter } from '@shared/utils/firebase/firestore-converter';
import {
  countryLabel,
  filterCheckoutCountries,
  isCheckoutCountry,
  matchCheckoutCountry,
  matchCheckoutCountryExact,
  type CheckoutCountryCode,
} from '../utils/checkout-countries';

interface CheckoutProductInfo {
  readonly name: string;
  readonly weightGrams: number | null;
}

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
    MatSelectModule,
  ],
  templateUrl: './checkout.page.html',
})
export class CheckoutPageComponent implements OnInit {
  readonly #cart = inject(CartService);
  readonly #checkout = inject(CheckoutOrderService);
  readonly #currency = inject(CurrencyService);
  readonly #firestore = injectFirestore();
  readonly #router = inject(Router);
  readonly #seo = inject(SeoService);
  readonly #shippingSettings = inject(ShippingSettingsService);
  readonly #snackbar = inject(SnackbarService);
  readonly #platformId = inject(PLATFORM_ID);

  readonly governorates = EGYPT_GOVERNORATES;
  readonly isSubmitting = signal(false);
  readonly paymentMethod = signal<CheckoutPaymentMethod>('paymob');
  /** True once the shopper edits the country field; blocks further geo overwrite. */
  readonly #countryTouched = signal(false);
  /** Last committed checkout country; blur restores this instead of leaving the field blank. */
  readonly #lastValidCountry = signal<CheckoutCountryCode>('EG');
  /** Typed filter text shown in the country autocomplete input. */
  readonly countryQuery = signal('');
  readonly displayCountryLabel = (code: string): string => (code ? countryLabel(code) : '');
  /** Shopper override; null means follow the auto-selected box. */
  readonly selectedBoxId = signal<ShippingBoxId | null>(null);

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
    boxId: null,
  });

  readonly filteredCountries = computed(() => filterCheckoutCountries(this.countryQuery()));

  readonly lines = this.#cart.lines;
  readonly isEmpty = this.#cart.isEmpty;
  readonly isEgypt = computed(() => this.shipping().country === 'EG');
  readonly codAvailable = computed(() => this.isEgypt());

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
          });
        }
      }
      return products;
    },
  });

  readonly regionBoxes = computed((): readonly ShippingBox[] => {
    const settings = this.#shippingSettings.settings();
    if (!settings) return [];
    return this.isEgypt() ? settings.egyptBoxes : settings.internationalBoxes;
  });

  readonly totalWeightGrams = computed(() => {
    const products = this.productsResource.value();
    const boxes = this.regionBoxes();
    const largest = boxes.reduce((max, box) => Math.max(max, box.maxWeightGrams), 0);
    let total = 0;
    for (const line of this.lines()) {
      const info = products?.get(line.productId);
      const unit =
        info && typeof info.weightGrams === 'number' && info.weightGrams > 0
          ? info.weightGrams
          : largest;
      total += unit * line.quantity;
    }
    return total;
  });

  readonly weightIncomplete = computed(() => {
    const products = this.productsResource.value();
    if (!products) return false;
    return this.lines().some((line) => {
      const info = products.get(line.productId);
      return !info || info.weightGrams === null;
    });
  });

  readonly recommendedBox = computed((): ShippingBox | null => {
    const boxes = this.regionBoxes();
    if (boxes.length === 0) return null;
    const result = selectShippingBox(boxes, this.totalWeightGrams(), null);
    return result.ok ? result.box : null;
  });

  readonly selectableBoxes = computed((): readonly ShippingBox[] => {
    return sortedBoxes(this.regionBoxes());
  });

  readonly activeBoxId = computed((): ShippingBoxId | null => {
    const selected = this.selectedBoxId();
    if (selected) return selected;
    return this.recommendedBox()?.id ?? null;
  });

  readonly boxTooHeavy = computed(() => {
    const boxes = this.regionBoxes();
    if (boxes.length === 0) return false;
    return !selectShippingBox(boxes, this.totalWeightGrams(), null).ok;
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
      const code =
        geo && isCheckoutCountry(geo) ? geo : ready ? 'EG' : null;
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

    // When region or bag weight changes, keep selection on a fitting box.
    effect(() => {
      const boxes = this.regionBoxes();
      const weight = this.totalWeightGrams();
      const selected = this.selectedBoxId();
      untracked(() => {
        if (!selected) return;
        const stillFits = selectShippingBox(boxes, weight, selected);
        if (!stillFits.ok) this.selectedBoxId.set(null);
      });
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Checkout | Atteya Store',
      description: 'Pay securely with card or wallet, or cash on delivery in Egypt.',
      noindex: true,
    });
    if (this.isEmpty()) {
      void this.#router.navigateByUrl('/');
    }
  }

  patchShipping<K extends keyof CheckoutShippingInput>(key: K, value: CheckoutShippingInput[K]): void {
    this.shipping.update((current) => {
      const next = { ...current, [key]: value };
      if (key === 'country') {
        if (typeof value === 'string' && isCheckoutCountry(value)) {
          this.#lastValidCountry.set(value);
        }
        this.selectedBoxId.set(null);
        if (value !== 'EG') {
          next.governorateId = null;
          if (this.paymentMethod() === 'cash-on-delivery') {
            this.paymentMethod.set('paymob');
          }
        }
      }
      return next;
    });
  }

  selectBox(boxId: ShippingBoxId): void {
    const boxes = this.regionBoxes();
    const weight = this.totalWeightGrams();
    const result = selectShippingBox(boxes, weight, boxId);
    if (!result.ok) {
      this.#snackbar.error('That box is too small for your bag. Choose a larger one.');
      return;
    }
    this.selectedBoxId.set(boxId);
  }

  boxFits(box: ShippingBox): boolean {
    return this.totalWeightGrams() <= box.maxWeightGrams;
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
    const code = String(event.option.value);
    if (!isCheckoutCountry(code)) return;
    this.patchShipping('country', code);
    this.countryQuery.set(countryLabel(code));
  }

  onCountryBlur(): void {
    // Defer so a mat-option click can fire optionSelected before we commit/clear.
    setTimeout(() => this.#commitCountryFromQuery(), 0);
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
    this.patchShipping('country', code);
    this.countryQuery.set(countryLabel(code));
  }

  setPaymentMethod(method: CheckoutPaymentMethod): void {
    if (method === 'cash-on-delivery' && !this.codAvailable()) return;
    this.paymentMethod.set(method);
  }

  productName(productId: string): string {
    return this.productsResource.value()?.get(productId)?.name ?? 'Item';
  }

  async placeOrder(): Promise<void> {
    if (this.isSubmitting() || this.isEmpty()) return;
    const draft = this.shipping();
    if (!draft.fullName.trim() || !draft.line1.trim() || !draft.city.trim() || !draft.postalCode.trim()) {
      this.#snackbar.error('Fill in your delivery address to continue.');
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
    if (draft.country === 'EG' && !draft.governorateId) {
      this.#snackbar.error('Choose your governorate so we can deliver your order.');
      return;
    }
    if (this.boxTooHeavy()) {
      this.#snackbar.error(
        'This order is too heavy for our delivery boxes. Remove an item or contact us.',
      );
      return;
    }
    const boxId = this.activeBoxId();
    if (!boxId) {
      this.#snackbar.error('Choose a delivery box to continue.');
      return;
    }
    const method = this.paymentMethod();
    if (method === 'cash-on-delivery' && draft.country !== 'EG') {
      this.#snackbar.error('Cash on delivery is only available for Egypt.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      const shipping: CheckoutShippingInput = {
        ...draft,
        fullName: draft.fullName.trim(),
        line1: draft.line1.trim(),
        line2: draft.line2?.trim() || null,
        city: draft.city.trim(),
        region: draft.region?.trim() || null,
        postalCode: draft.postalCode.trim(),
        country: draft.country,
        phone: draft.phone.trim(),
        governorateId: draft.governorateId,
        boxId,
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

      const result = await this.#checkout.placeCodOrder({
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
