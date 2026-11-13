import { isPlatformBrowser, NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { STORE_INFO, whatsappChatUrl } from '@core/config/store-info';
import { AuthService } from '@core/services/auth/auth.service';
import { type BagPricingProduct, priceBag } from '@core/services/cart/cart-deals';
import type { GiftCardColour } from '@core/services/cart/gift-card-label';
import type { CartLineDraft } from '@core/services/cart/cart.model';
import { CartService } from '@core/services/cart/cart.service';
import { CurrencyService } from '@core/services/currency/currency.service';
import { DrawerService } from '@core/services/drawer/drawer.service';
import {
  displayDecimals,
  displayPrice,
  type Offer,
  type OfferBundleSlot,
  toDisplayAmount,
} from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { bundleSetSavingLabel, canShopOffer } from '@core/services/offers/offer-shop';
import { fromTransferOffer } from '@core/services/offers/offer-transfer';
import { OffersService } from '@core/services/offers/offers.service';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { AppImageFallbackDirective } from '@shared/directives/image-fallback';
import { HorizontalScrollDirective } from '@shared/directives/horizontal-scroll/horizontal-scroll.directive';
import { ColorSwatchComponent } from '@shared/ui/color-swatch/color-swatch.component';
import { ErrorPageComponent } from '@shared/ui/error-page';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { normalizeImageKitPath } from '@shared/utils/image';
import { formatMoney } from '@shared/utils/money';
import type { ProductView } from '../product/models/product-page.model';
import { type BundleChoice, bundlePieceLine } from '../product/utils/product-bundle';
import type { BundlePageResult } from './models/bundle-page.model';
import { BundleProductsService } from './services/bundle-products.service';
import {
  type BundleGroupFacts,
  type BundleGroupPicks,
  type BundlePiecePick,
  bundleEndsIn,
  bundleGroupFacts,
  bundlePageState,
  bundleStartsOn,
  chosenCountText,
  firstOpenGroup,
  groupComplete,
  groupFixed,
  nextBundleAction,
  pickProduct,
  pickSize,
  piecesChosen,
  removeProductPiece,
  soldOutText,
  startingPicks,
} from './utils/bundle-page';

/** One size button: sold-out sizes stay listed, struck through and off. */
interface SizeButton {
  readonly id: string;
  readonly label: string;
  readonly soldOut: boolean;
}

/** The size row of one picked piece that has sizes. */
interface SizeRowView {
  readonly piece: number;
  readonly title: string;
  readonly sizes: readonly SizeButton[];
  readonly pickedId: string | null;
}

/** One product card of a group. */
interface CardView {
  readonly productId: string;
  readonly label: string;
  readonly name: string;
  readonly colours: readonly GiftCardColour[];
  readonly imagePath: string;
  readonly price: string;
  /** Pieces of the group that are this product. */
  readonly count: number;
}

/** One group of the bundle as the page shows it. */
interface GroupView {
  readonly index: number;
  readonly number: number;
  readonly name: string;
  readonly quantity: number;
  /** One product only: in the bundle from the start ("✓ Racket · Included"). */
  readonly fixed: boolean;
  readonly complete: boolean;
  /** Every piece of the group has its product (a group of 2+ takes no more). */
  readonly full: boolean;
  /**
   * `open`: its cards show; `folded`: finished, one line with Change; `waiting`: a later step,
   * greyed until reached; `fixed`: the included product's small row; `soldOut`: nothing in stock.
   */
  readonly mode: 'open' | 'folded' | 'waiting' | 'fixed' | 'soldOut';
  readonly cards: readonly CardView[];
  readonly sizeRows: readonly SizeRowView[];
  /** "Nox AT10 Genius", "Head Pro Balls × 2, Bullpadel Balls". */
  readonly pickedNames: string;
  /** "3 of 3 chosen" for a group of 2+ pieces. */
  readonly chosenText: string;
  readonly soldOutText: string;
}

/** One product of a bundle whose groups each have one product (shown side by side). */
interface SideItemView {
  readonly group: number;
  readonly card: CardView;
  readonly quantity: number;
  /** Its normal price, struck through when the bundle lowers it; empty otherwise. */
  readonly normal: string;
  /** Its share of the bundle price. */
  readonly share: string;
  readonly sizeRows: readonly SizeRowView[];
}

/** Picks and the products they name, priced the way the bag prices them. */
interface BundleTotals {
  readonly normal: number;
  readonly total: number;
  /** Per group: normal and bundle share of its picked pieces. */
  readonly byGroup: readonly { readonly normal: number; readonly share: number }[];
}

/**
 * The Bundle & Save page, `/bundle/<offer id>` (ATS-279): the shopper picks a product (and size)
 * from each group of the offer and adds the whole bundle to the bag in one tap. Server-rendered
 * header (kicker, title, saving); the groups' products are read in the browser.
 */
@Component({
  selector: 'app-bundle-page',
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    RouterLink,
    MatButtonModule,
    AppImageFallbackDirective,
    HorizontalScrollDirective,
    ColorSwatchComponent,
    ErrorPageComponent,
    SharedIconModule,
    SkeletonComponent,
  ],
  templateUrl: './bundle.page.html',
  host: { class: 'block w-full' },
})
export class BundlePage {
  readonly page = input.required<BundlePageResult>();
  /** `?product=<id>`: the product page the shopper came from; it starts picked in its group. */
  readonly product = input<string | undefined>(undefined);
  /** `?from=bag`: the bag's pieces for this offer start picked, and the page scrolls to the first missing group. */
  readonly from = input<string | undefined>(undefined);

  readonly #auth = inject(AuthService);
  readonly #cart = inject(CartService);
  readonly #currency = inject(CurrencyService);
  readonly #drawer = inject(DrawerService);
  readonly #liveOffers = inject(OffersService);
  readonly #reader = inject(BundleProductsService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);
  readonly #platformId = inject(PLATFORM_ID);

  readonly path = normalizeImageKitPath;
  readonly whatsappUrl = whatsappChatUrl(STORE_INFO.contact.whatsapp);

  /** False until the first browser render, so hydration matches the server HTML. */
  readonly #hydrated = signal(false);
  /** Pricing clock: the render time first, then the browser's clock every minute. */
  readonly #nowMs = linkedSignal(() => {
    const p = this.page();
    return p.status === 'found' ? p.renderedAtMs : Date.now();
  });
  /** The group the shopper opened with Change or the button; null = the first one not finished. */
  readonly #openGroup = signal<number | null>(null);
  /** Scrolled to the first missing group once (`?from=bag`). */
  #scrolled = false;

  readonly offer = computed<Offer | null>(() => {
    const p = this.page();
    return p.status === 'found' ? fromTransferOffer(p.offer) : null;
  });

  readonly slots = computed<readonly OfferBundleSlot[]>(() => {
    const reward = this.offer()?.reward;
    return reward?.kind === 'bundleSet' ? reward.slots : [];
  });

  /** Live offers after hydration (other offers change the pieces' own prices), always with this one. */
  readonly #offers = computed<readonly Offer[]>(() => {
    const offer = this.offer();
    if (!offer) return [];
    if (!this.#hydrated() || !this.#liveOffers.ready() || this.#liveOffers.failed()) return [offer];
    const all = this.#liveOffers.all();
    return all.some((entry) => entry.id === offer.id) ? all : [...all, offer];
  });

  readonly #pricingCtx = computed(() => ({
    now: new Date(this.#nowMs()),
    signedIn: this.#hydrated() && this.#auth.offerSignedIn(),
  }));

  /** Can the bundle be bought now? Signed-in-only offers wait for the browser to know who is here. */
  readonly state = computed(() => {
    const offer = this.offer();
    if (!offer) return 'unavailable' as const;
    const state = bundlePageState(offer, this.#nowMs(), this.#pricingCtx().signedIn);
    if (state === 'members' && !(this.#hydrated() && this.#auth.isAuthReady())) return 'checking' as const;
    return state;
  });

  /** Signed in, but the email isn't confirmed yet (member prices need a confirmed email). */
  readonly needsConfirmedEmail = computed(() => this.#hydrated() && this.#auth.isAuthenticated());

  /** "Bundle & Save · Ends in 2d 14h", "Bundle & Save · Members". */
  readonly kicker = computed(() => {
    const offer = this.offer();
    if (!offer) return 'Bundle & Save';
    if (this.state() === 'open') {
      const ends = bundleEndsIn(offer.schedule.endsAt?.getTime() ?? null, this.#nowMs());
      if (ends) return `Bundle & Save · ${ends}`;
    }
    return offer.audience === 'signedIn' ? 'Bundle & Save · Members' : 'Bundle & Save';
  });

  /** "Save 60%", "Save EGP 500", "All for EGP 4,500", "Cheapest one free"; none once it can't be bought. */
  readonly saving = computed(() => {
    const reward = this.offer()?.reward;
    const state = this.state();
    if (reward?.kind !== 'bundleSet' || state === 'ended' || state === 'unavailable') return '';
    return bundleSetSavingLabel(reward.setReward, (egp) => this.#money(egp));
  });

  /** The grey note when the bundle can't be bought. */
  readonly note = computed(() => {
    const offer = this.offer();
    switch (this.state()) {
      case 'ended':
        return {
          title: 'This bundle has ended.',
          text: 'Its products are still in the shop at their normal price.',
        };
      case 'upcoming':
        return offer?.schedule.startsAt
          ? {
              title: bundleStartsOn(offer.schedule.startsAt),
              text: 'Its products are in the shop now at their normal price.',
            }
          : null;
      case 'unavailable':
        return {
          title: "This bundle isn't available right now.",
          text: 'Its products are still in the shop at their normal price.',
        };
      default:
        return null;
    }
  });

  /** Shop These Products: the offer's Shop page when Shop can list it, else Shop. */
  readonly shopQuery = computed(() => {
    const offer = this.offer();
    return offer && canShopOffer(offer) ? { offer: offer.id } : null;
  });

  readonly signInQuery = computed(() => ({ returnUrl: `/bundle/${this.offer()?.id ?? ''}` }));

  /** What the products read depends on: plain values, so a price change reads nothing again. */
  readonly #readKey = computed(() => {
    const offer = this.offer();
    if (!this.#hydrated() || !offer || this.state() !== 'open') return undefined;
    return offer.id;
  });

  /** The products of each group, read in the browser. */
  readonly #choices = resource({
    params: () => this.#readKey(),
    loader: () => {
      const offer = untracked(this.offer);
      return offer ? this.#reader.choicesByGroup(offer, untracked(this.slots)) : Promise.resolve([]);
    },
  });

  readonly loading = computed(
    () =>
      this.state() === 'checking' ||
      (this.state() === 'open' && !this.#choices.hasValue() && !this.#choices.error()),
  );
  readonly failed = computed(() => this.state() === 'open' && !!this.#choices.error());

  readonly #choiceLists = computed<readonly (readonly BundleChoice[])[] | null>(() =>
    this.#choices.hasValue() ? this.#choices.value() : null,
  );

  readonly #groups = computed<readonly BundleGroupFacts[]>(() => {
    const lists = this.#choiceLists();
    if (!lists) return [];
    return bundleGroupFacts(
      this.slots(),
      lists.map((list) => list.map((choice) => choice.view)),
    );
  });

  /** Picks start once the products are read (and, from the bag, once the bag has loaded). */
  readonly #picksKey = computed(() => {
    const offer = this.offer();
    if (!offer || !this.#choiceLists()) return '';
    const fromBag = this.from() === 'bag';
    if (fromBag && !this.#cart.ready()) return '';
    return `${offer.id}|${this.product() ?? ''}|${fromBag}`;
  });

  readonly #picks = linkedSignal<string, BundleGroupPicks>({
    source: () => this.#picksKey(),
    computation: (key) =>
      key ? startingPicks(this.#groups(), this.product() ?? null, this.#bagPieces()) : [],
  });

  /** The bag's pieces of this offer's products (`?from=bag`), one entry per piece. */
  #bagPieces(): BundlePiecePick[] {
    if (this.from() !== 'bag') return [];
    return this.#cart.lines().flatMap((line) =>
      Array.from({ length: Math.min(line.quantity, 5) }, () => ({
        productId: line.productId,
        sizeId: line.selection['size'] ?? null,
      })),
    );
  }

  readonly soldOut = computed(() => this.#groups().some((group) => group.choices.length === 0));
  readonly soldOutNote = computed(() => {
    const group = this.#groups().find((entry) => entry.choices.length === 0);
    return group ? soldOutText(group.name) : '';
  });

  /** Every group has one product: shown side by side with a "+", only sizes are asked. */
  readonly sideBySide = computed(() => {
    const groups = this.#groups();
    return groups.length > 0 && groups.every(groupFixed);
  });

  readonly action = computed(() => nextBundleAction(this.#groups(), this.#picks()));

  /** The group the shopper is on. */
  readonly #activeGroup = computed(() => this.#openGroup() ?? firstOpenGroup(this.#groups(), this.#picks()));

  /** The product a choice names, for prices and bag lines. */
  #choice(group: number, productId: string): BundleChoice | undefined {
    return this.#choiceLists()?.[group]?.find((entry) => entry.view.productId === productId);
  }

  /** One piece's own price after its item offers (what the card shows). */
  #ownPrice(product: ProductView): number {
    return displayPrice(toPricedProduct(product), this.#offers(), this.#pricingCtx(), { bundleFrom: false })
      .fromPrice;
  }

  #sizeRows(group: BundleGroupFacts, index: number, picks: readonly BundlePiecePick[]): SizeRowView[] {
    const rows: SizeRowView[] = [];
    picks.forEach((pick, piece) => {
      const choice = this.#choice(index, pick.productId);
      if (!choice?.view.sizes) return;
      const offered = new Set(choice.view.sizes.map((size) => size.id));
      const stock = choice.product.stockBySize;
      const option = choice.product.options.find((entry) => entry.key === 'size');
      const sizes: SizeButton[] = (option?.values ?? [])
        .filter((value) => offered.has(value.id) || (!!stock && (stock[value.id] ?? 0) <= 0))
        .map((value) => ({ id: value.id, label: value.label, soldOut: !offered.has(value.id) }));
      const name = group.name;
      const title = group.quantity > 1 ? `${name} ${piece + 1} size` : `${name} size`;
      rows.push({ piece, title, sizes, pickedId: offered.has(pick.sizeId ?? '') ? pick.sizeId : null });
    });
    return rows;
  }

  #cards(index: number, picks: readonly BundlePiecePick[]): CardView[] {
    return (this.#choiceLists()?.[index] ?? []).map((choice) => ({
      productId: choice.view.productId,
      label: choice.view.label,
      name: choice.view.cardName,
      colours: choice.view.colors.length > 1 ? choice.view.cardColours : [],
      imagePath: choice.view.imagePath,
      price: this.#money(this.#ownPrice(choice.product)),
      count: picks.filter((pick) => pick.productId === choice.view.productId).length,
    }));
  }

  readonly groupViews = computed<readonly GroupView[]>(() => {
    const groups = this.#groups();
    const picks = this.#picks();
    const active = this.#activeGroup();
    const steps = groups.length >= 3;
    const prefilled = this.product();
    return groups.map((group, index): GroupView => {
      const groupPicks = picks[index] ?? [];
      const complete = groupComplete(group, groupPicks);
      const fixed = groupFixed(group);
      const cameFrom = !!prefilled && groupPicks.some((pick) => pick.productId === prefilled);
      let mode: GroupView['mode'];
      if (group.choices.length === 0) mode = 'soldOut';
      else if (fixed) mode = 'fixed';
      else if (index === active) mode = 'open';
      else if (complete && (steps || cameFrom)) mode = 'folded';
      else if (steps && index > active) mode = 'waiting';
      else mode = 'open';
      const names = new Map<string, number>();
      for (const pick of groupPicks) names.set(pick.productId, (names.get(pick.productId) ?? 0) + 1);
      const pickedNames = [...names.entries()]
        .map(([id, count]) => {
          const name = group.choices.find((choice) => choice.productId === id)?.label ?? '';
          return count > 1 ? `${name} × ${count}` : name;
        })
        .filter((name) => name.length > 0)
        .join(', ');
      return {
        index,
        number: index + 1,
        name: group.name,
        quantity: group.quantity,
        fixed,
        complete,
        full: piecesChosen(group, groupPicks) >= group.quantity,
        mode,
        cards: this.#cards(index, groupPicks),
        sizeRows: mode === 'open' || mode === 'fixed' ? this.#sizeRows(group, index, groupPicks) : [],
        pickedNames,
        chosenText: chosenCountText(group, groupPicks),
        soldOutText: soldOutText(group.name),
      };
    });
  });

  /**
   * The picked pieces as bag lines (a piece whose size is still open is priced without one), and
   * the group of each line.
   */
  #draftLines(strict: boolean): { lines: CartLineDraft[]; groups: number[] } | null {
    const lines: CartLineDraft[] = [];
    const groups: number[] = [];
    const picks = this.#picks();
    for (let index = 0; index < picks.length; index++) {
      for (const pick of picks[index] ?? []) {
        const choice = this.#choice(index, pick.productId);
        if (!choice) {
          if (strict) return null;
          continue;
        }
        const line = bundlePieceLine(choice, pick);
        if (!line && strict) return null;
        lines.push(line ?? { productId: choice.product.id, variantId: null, selection: {}, quantity: 1 });
        groups.push(index);
      }
    }
    return { lines, groups };
  }

  /** The picked pieces priced by the bag's own `priceBag()`. */
  readonly #totals = computed<BundleTotals>(() => {
    const byGroup = this.slots().map(() => ({ normal: 0, share: 0 }));
    const draft = this.#draftLines(false);
    const lists = this.#choiceLists();
    if (!draft || !lists || draft.lines.length === 0) return { normal: 0, total: 0, byGroup };
    const products = new Map<string, BagPricingProduct>();
    for (const choice of lists.flat()) {
      products.set(choice.product.id, {
        priced: toPricedProduct(choice.product),
        options: choice.product.options,
        variants: choice.product.variants,
      });
    }
    const priced = priceBag(draft.lines, products, this.#offers(), this.#pricingCtx());
    let normal = 0;
    let total = 0;
    priced.lines.forEach((line, n) => {
      if (!line) return;
      const group = byGroup[draft.groups[n]!];
      normal += line.fullEgp;
      total += line.lineEgp;
      if (group) {
        byGroup[draft.groups[n]!] = {
          normal: group.normal + line.fullEgp,
          share: group.share + line.lineEgp,
        };
      }
    });
    return { normal, total, byGroup };
  });

  /** What Add Bundle to Bag adds: one line per piece, or null while anything is open. */
  readonly #bundleLines = computed(() => {
    if (this.action().kind !== 'add') return null;
    return this.#draftLines(true)?.lines ?? null;
  });

  readonly complete = computed(() => this.#bundleLines() !== null);
  readonly normalPrice = computed(() => this.#money(this.#totals().normal));
  readonly bundlePrice = computed(() => this.#money(this.#totals().total));
  readonly youSave = computed(() => {
    const totals = this.#totals();
    return totals.normal > totals.total ? this.#money(totals.normal - totals.total) : '';
  });

  /** "2 of 4 chosen" while products are still missing. */
  readonly progressText = computed(() => {
    const groups = this.#groups();
    const picks = this.#picks();
    const done = groups.filter((group, index) => groupComplete(group, picks[index] ?? [])).length;
    return done < groups.length ? `${done} of ${groups.length} chosen` : '';
  });

  readonly hasPicks = computed(() => this.#picks().some((picks) => picks.length > 0));

  readonly sideItems = computed<readonly SideItemView[]>(() => {
    if (!this.sideBySide()) return [];
    const totals = this.#totals();
    const picks = this.#picks();
    return this.groupViews().map((group) => {
      const money = totals.byGroup[group.index] ?? { normal: 0, share: 0 };
      return {
        group: group.index,
        card: group.cards[0]!,
        quantity: group.quantity,
        normal: money.share < money.normal ? this.#money(money.normal) : '',
        share: this.#money(money.share),
        sizeRows: this.#sizeRows(this.#groups()[group.index]!, group.index, picks[group.index] ?? []),
      };
    });
  });

  constructor() {
    afterNextRender(() => this.#hydrated.set(true));

    if (isPlatformBrowser(this.#platformId)) {
      const timer = setInterval(() => this.#nowMs.set(Date.now()), 60_000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
      afterNextRender(() => this.#nowMs.set(Date.now()));
    }

    effect(() => {
      const offer = this.offer();
      this.#seo.setPageMetadata(
        offer
          ? {
              title: `${offer.title.trim() || 'Bundle & Save'} | Atteya Store`,
              description: 'Pick one product from each group and add the whole bundle to your bag.',
              noindex: true,
            }
          : {
              title:
                this.page().status === 'missing'
                  ? 'Page Not Found | Atteya Store'
                  : 'Bundle & Save | Atteya Store',
              description: 'This bundle is not available.',
              noindex: true,
            },
      );
    });

    // From the bag: once the picks start, scroll to the first group still missing a piece.
    effect(() => {
      if (this.from() !== 'bag' || this.#scrolled || this.#picksKey() === '') return;
      this.#scrolled = true;
      const group = untracked(() => firstOpenGroup(this.#groups(), this.#picks()));
      afterNextRender({ write: () => this.#scrollTo(group, false) }, { injector: this.#injector });
    });
  }

  #money(egp: number): string {
    const entry = this.#currency.entry();
    return formatMoney(toDisplayAmount(egp, entry), entry.code, displayDecimals(entry.code));
  }

  #scrollTo(group: number, focus: boolean): void {
    const element = this.#host.nativeElement.querySelector<HTMLElement>(`[data-bundle-group="${group}"]`);
    if (!element) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (focus) {
      element
        .querySelector<HTMLButtonElement>('button[data-choice]:not(:disabled)')
        ?.focus({ preventScroll: true });
    }
  }

  #updateGroup(index: number, change: (picks: readonly BundlePiecePick[]) => BundlePiecePick[]): void {
    this.#picks.update((all) => all.map((picks, at) => (at === index ? change(picks) : picks)));
    this.#openGroup.set(index);
  }

  pick(group: number, productId: string): void {
    const facts = this.#groups()[group];
    if (!facts) return;
    this.#updateGroup(group, (picks) => pickProduct(facts, picks, productId));
  }

  remove(group: number, productId: string): void {
    this.#updateGroup(group, (picks) => removeProductPiece(picks, productId));
  }

  chooseSize(group: number, piece: number, sizeId: string): void {
    this.#picks.update((all) =>
      all.map((picks, at) => (at === group ? pickSize(picks, piece, sizeId) : picks)),
    );
  }

  change(group: number): void {
    this.#openGroup.set(group);
    afterNextRender({ write: () => this.#scrollTo(group, true) }, { injector: this.#injector });
  }

  /** The one button: opens the next thing to choose, or adds the whole bundle and opens the bag. */
  next(): void {
    const action = this.action();
    if (action.kind !== 'add') {
      this.change(action.group);
      return;
    }
    const lines = this.#bundleLines();
    if (!lines || this.soldOut()) return;
    if (!this.#cart.addAll(lines)) {
      this.#snackbar.error('Your bag is full. Remove an item to add these.');
      return;
    }
    this.#snackbar.success('Added to your bag');
    this.#drawer.open('cart');
  }
}
