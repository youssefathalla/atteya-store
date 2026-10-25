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
import { AuthService } from '@core/services/auth/auth.service';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { displayPrice, type Offer, priceItem } from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { fromTransferOffer } from '@core/services/offers/offer-transfer';
import { PublicOffersReader } from '@core/services/offers/public-offers.reader';
import { CatalogService, toVariantFacts } from '@core/services/products';
import { SeoService } from '@core/services/seo';
import { ProductPriceComponent } from '@shared/components/product-price/product-price.component';
import { AddToBagButtonComponent } from './components/add-to-bag-button/add-to-bag-button.component';
import { ProductGalleryComponent } from './components/product-gallery/product-gallery.component';
import { ProductOptionsComponent } from './components/product-options/product-options.component';
import { ProductSiblingsComponent } from './components/product-siblings/product-siblings.component';
import type { OptionSelection, ProductPageResult, ProductView } from './models/product-page.model';
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
    ProductPriceComponent,
    ProductGalleryComponent,
    ProductOptionsComponent,
    ProductSiblingsComponent,
    AddToBagButtonComponent,
  ],
  templateUrl: './product.component.html',
  host: { class: 'block w-full' },
})
export class ProductComponent {
  readonly page = input.required<ProductPageResult>();

  readonly #seo = inject(SeoService);
  readonly #catalog = inject(CatalogService);
  readonly #offersReader = inject(PublicOffersReader);
  readonly #auth = inject(AuthService);
  readonly #router = inject(Router);
  readonly #destroyRef = inject(DestroyRef);

  /** False until the first browser render so hydration matches server pricing. */
  readonly #hydrated = signal(false);
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
    if (p.offers) return p.offers.map(fromTransferOffer);
    return this.#fallbackOffers.hasValue() ? this.#fallbackOffers.value() : [];
  });

  readonly product = computed<ProductView | null>(() => {
    const p = this.page();
    return p.status === 'found' ? p.product : null;
  });

  readonly inStock = computed(() => {
    const p = this.product();
    return p ? isProductInStock(p) : false;
  });

  readonly selection = linkedSignal<ProductView | null, OptionSelection>({
    source: this.product,
    computation: (p) => (p ? initialSelection(p) : {}),
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
      price: p.price,
      fromPrice: d.fromPrice,
      listPrice: d.listPrice,
      partial: d.partial,
      badges: d.badges.map((badge) => badge.text),
    };
  });

  readonly cartLine = computed<CartLineDraft | null>(() => {
    const p = this.product();
    const sel = this.selection();
    const v = this.variant();
    if (!p || !this.inStock()) return null;
    if (p.options.some((option) => !sel[option.key])) return null;
    if (stockMode(p) === 'variants' && (!v || v.stock <= 0)) return null;
    return { productId: p.id, variantId: v?.id ?? null, selection: sel, quantity: 1 };
  });

  constructor() {
    afterNextRender(() => {
      this.#hydrated.set(true);
      this.#nowMs.set(Date.now());
      const id = setInterval(() => this.#nowMs.set(Date.now()), 60_000);
      this.#destroyRef.onDestroy(() => clearInterval(id));
    });

    effect(() => {
      const page = this.page();
      if (page.status === 'found') {
        const p = page.product;
        const brand = this.brandName();
        this.#seo.setPageMetadata({
          title: `${p.name} | Atteya Store`,
          description:
            p.summary ?? `${p.name}${brand ? ` by ${brand}` : ''}. Shop at Atteya Store.`,
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

  select(key: string, valueId: string): void {
    this.selection.update((current) => ({ ...current, [key]: valueId }));
  }

  retry(): void {
    void this.#router.navigateByUrl(this.#router.url, { onSameUrlNavigation: 'reload' });
  }
}
