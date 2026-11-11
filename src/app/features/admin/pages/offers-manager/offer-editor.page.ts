import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { Router, RouterLink } from '@angular/router';
import {
  DEFAULT_OFFER_BANNER,
  displayPrice,
  matchProduct,
  validateOffer,
  type Offer,
  type OfferAudience,
  type OfferBanner,
  type OfferConditions,
  type OfferDraft,
  type OfferIssue,
  type OfferMinimum,
  type OfferReward,
  type OfferSchedule,
  type OfferScope,
} from '@core/services/offers/engine';
import { toPricedProduct } from '@core/services/offers/offer.model';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { normalizeImageKitPath } from '@shared/utils/image';
import { ProductsAdminService } from '../products-manager/services/products-admin.service';
import { BannerEditorComponent } from './components/banner-editor/banner-editor.component';
import { ConditionGroupEditorComponent } from './components/condition-group-editor/condition-group-editor.component';
import { EditorStepsComponent } from './components/editor-steps/editor-steps.component';
import { OfferPreviewComponent } from './components/offer-preview/offer-preview.component';
import { OfferSettingsComponent } from './components/offer-settings/offer-settings.component';
import {
  OfferSummaryPanelComponent,
  type SampleProduct,
} from './components/offer-summary-panel/offer-summary-panel.component';
import { ProductTargetsComponent } from './components/product-targets/product-targets.component';
import { RewardEditorComponent } from './components/reward-editor/reward-editor.component';
import { ScheduleEditorComponent } from './components/schedule-editor/schedule-editor.component';
import {
  affectedStats,
  autoOfferTitle,
  autoTeamName,
  createEmptyOfferDraft,
  DEAL_CARDS,
  defaultDealFor,
  isUnavailableDeal,
  issueStep,
  NEXT_STEP_LABEL,
  offerCheckSentence,
  offerDealPhrase,
  offerRunLine,
  offerSentence,
  offerTargetPhrase,
  productCountLabel,
  rewardPickerKind,
  runDays,
  daysLabel,
  cairoShort,
  UNAVAILABLE_DEAL_MESSAGE,
  withoutEmptyFreeItemRules,
  withoutStackSaleItems,
  type CatalogNames,
  type OfferEditorStep,
  type RewardPickerKind,
} from './models/offer-admin.model';
import { OffersAdminService } from './services/offers-admin.service';

type ProductsMode = 'all' | 'some';

const STEPS: readonly OfferEditorStep[] = [1, 2, 3, 4];

/** Message when "Only some products" has nothing picked yet. */
const PICK_PRODUCTS_MESSAGE = 'Add at least one category, brand or product, or pick Every product.';

/**
 * The offer editor (ATS-220): 4 steps (The deal, Which products, Who and when, Check and start)
 * with a summary panel. The saved offer document is the same as the old one-page form's.
 */
@Component({
  selector: 'app-offer-editor-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    SharedIconModule,
    SkeletonComponent,
    EditorStepsComponent,
    OfferSummaryPanelComponent,
    OfferSettingsComponent,
    RewardEditorComponent,
    ConditionGroupEditorComponent,
    ProductTargetsComponent,
    ScheduleEditorComponent,
    BannerEditorComponent,
    OfferPreviewComponent,
  ],
  templateUrl: './offer-editor.page.html',
})
export class OfferEditorPageComponent implements OnInit {
  readonly offerId = input<string>();

  readonly #offersAdmin = inject(OffersAdminService);
  readonly #productsAdmin = inject(ProductsAdminService);
  readonly #seo = inject(SeoService);
  readonly #snackbar = inject(SnackbarService);
  readonly #router = inject(Router);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #injector = inject(Injector);

  readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  /** What staff typed; the title and team name are filled in until staff edit them (see `offer`). */
  readonly draft = signal<OfferDraft>(createEmptyOfferDraft());
  readonly step = signal<OfferEditorStep>(1);
  /** The furthest step reached; steps up to it are finished. */
  readonly furthest = signal<OfferEditorStep>(1);
  readonly titleEdited = signal(false);
  readonly nameEdited = signal(false);
  readonly productsMode = signal<ProductsMode>('all');
  /** Include groups kept while "Every product" is picked, so switching back restores them. */
  readonly #savedInclude = signal<OfferConditions>({ anyOf: [] });
  readonly showAdvanced = signal(false);
  readonly showProducts = signal(false);
  readonly limitOpen = signal(false);
  readonly moreOpen = signal(false);
  /** The offer was on when it was opened, so the main button says Save Changes. */
  readonly wasActive = signal(false);
  readonly isSaving = signal(false);
  #hydratedOfferId: string | null = null;

  readonly editorResource = resource({
    params: () => ({ offerId: this.offerId() ?? null }),
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) {
        return { offer: null, offers: [], products: [], categories: [], brands: [] };
      }
      const [offer, offers, products, categories, brands] = await Promise.all([
        params.offerId ? this.#offersAdmin.getOffer(params.offerId) : Promise.resolve(null),
        this.#offersAdmin.listOffers(),
        this.#productsAdmin.listAllProducts(),
        this.#productsAdmin.listAllCategories(),
        this.#productsAdmin.listAllBrands(),
      ]);
      return { offer, offers, products, categories, brands };
    },
  });

  readonly products = computed(() => this.editorResource.value()?.products ?? []);
  readonly categories = computed(() => this.editorResource.value()?.categories ?? []);
  readonly brands = computed(() => this.editorResource.value()?.brands ?? []);
  readonly otherOffers = computed(() => this.editorResource.value()?.offers ?? []);

  readonly names = computed<CatalogNames>(() => ({
    categories: new Map(this.categories().map((category) => [category.id, category.name])),
    brands: new Map(this.brands().map((brand) => [brand.id, brand.name])),
    products: new Map(this.products().map((product) => [product.id, product.name])),
  }));

  readonly pricedEntries = computed(() =>
    this.products().map((product) => ({
      product,
      priced: toPricedProduct(product),
      inStock: product.inStock,
    })),
  );
  readonly pricedProducts = computed(() => this.pricedEntries().map((entry) => entry.priced));

  /** The offer as it will be saved: the draft with the title and team name filled in when untouched. */
  readonly offer = computed<OfferDraft>(() => {
    const draft = this.draft();
    const names = this.names();
    return {
      ...draft,
      title: this.titleEdited() ? draft.title : autoOfferTitle(draft, names),
      name: this.nameEdited() ? draft.name : autoTeamName(draft, names, new Date()),
    };
  });

  readonly validation = computed(() =>
    validateOffer(this.offer(), this.pricedProducts(), this.otherOffers(), {
      now: new Date(),
      signedIn: true,
    }),
  );

  /** Top banner settings; an offer saved before the banner existed starts switched off. */
  readonly banner = computed(() => this.draft().banner ?? DEFAULT_OFFER_BANNER);

  readonly isUnavailableDeal = computed(() => isUnavailableDeal(this.draft().reward, this.draft().scope));
  readonly pickedDeal = computed<RewardPickerKind>(() =>
    rewardPickerKind(this.draft().reward, this.draft().scope),
  );

  readonly pageHeading = computed(() => (this.offerId() ? 'Edit Offer' : 'New Offer'));

  // ---------------------------------------------------------------------------------------------
  // What each step still needs
  // ---------------------------------------------------------------------------------------------

  /** Every error, with the step it shows on. */
  readonly #errors = computed<readonly (OfferIssue & { readonly step: OfferEditorStep })[]>(() => {
    const list = this.validation().errors.map((issue) => ({ ...issue, step: issueStep(issue.code) }));
    if (this.isUnavailableDeal())
      list.unshift({ code: 'deal.unavailable', message: UNAVAILABLE_DEAL_MESSAGE, step: 1 });
    if (this.productsMode() === 'some' && this.draft().conditions.anyOf.length === 0) {
      list.push({ code: 'conditions.none', message: PICK_PRODUCTS_MESSAGE, step: 2 });
    }
    return list;
  });

  readonly stepValid = computed(() => {
    const errors = this.#errors();
    return (step: OfferEditorStep): boolean => !errors.some((issue) => issue.step === step);
  });

  readonly dealErrors = computed(() => this.#errorsWhere((code, step) => step === 1 && code !== 'title'));
  readonly titleErrors = computed(() => this.#errorsWhere((code) => code === 'title'));
  readonly productErrors = computed(() => this.#errorsWhere((_, step) => step === 2));
  readonly whenErrors = computed(() => this.#errorsWhere((code) => code.startsWith('schedule.')));
  readonly extrasErrors = computed(() =>
    this.#errorsWhere((code, step) => step === 3 && !code.startsWith('schedule.')),
  );
  readonly nameErrors = computed(() => this.#errorsWhere((_, step) => step === 4));

  /** Finished steps shown as links: reached, not the current one, and every step before it is fine. */
  readonly doneSteps = computed<readonly OfferEditorStep[]>(() => {
    const valid = this.stepValid();
    return STEPS.filter(
      (step) => step !== this.step() && step <= this.furthest() && STEPS.filter((s) => s < step).every(valid),
    );
  });

  readonly nextLabel = computed(() => NEXT_STEP_LABEL[this.step()]);

  // ---------------------------------------------------------------------------------------------
  // The right panel and the counts
  // ---------------------------------------------------------------------------------------------

  readonly sentence = computed(() =>
    this.step() === 4
      ? null
      : offerSentence(this.offer(), this.names(), Math.max(this.step(), this.furthest()), new Date()),
  );

  readonly sample = computed<SampleProduct | null>(() => {
    const draft = this.offer();
    const offer: Offer = { ...draft, id: draft.id ?? 'preview-offer', active: true, archived: false };
    const ctx = { now: draft.schedule.startsAt ?? new Date(), signedIn: true };
    let fallback: SampleProduct | null = null;
    for (const { product, priced, inStock } of this.pricedEntries()) {
      if (matchProduct(draft.conditions, draft.exclude, priced) === 'none') continue;
      const res = displayPrice(priced, [offer], ctx);
      const rawImage = product.images[0]?.path;
      const sample: SampleProduct = {
        name: product.name,
        imagePath: rawImage ? normalizeImageKitPath(rawImage) : null,
        badge: res.badges[0]?.text ?? null,
        listPrice: Math.max(product.price, product.compareAtPrice ?? 0),
        offerPrice: res.fromPrice,
        partial: res.partial,
      };
      if (inStock && sample.imagePath && res.fromPrice < product.price) return sample;
      fallback ??= sample;
    }
    return fallback;
  });

  readonly bannerText = computed(() => {
    const draft = this.offer();
    const banner = this.banner();
    if (!banner.show || draft.audience !== 'everyone' || draft.limits.perCustomer !== null) return null;
    return banner.text?.trim() || draft.title;
  });

  readonly stats = computed(() => affectedStats(this.offer(), this.pricedEntries()));
  readonly affectedLabel = computed(() => productCountLabel(this.stats().total));

  readonly overlapWarnings = computed(() =>
    this.validation().warnings.filter((issue) => issue.code.startsWith('overlap.')),
  );

  /** Step 4 "Good to know": every warning, plus how products already on sale are treated. */
  readonly goodToKnow = computed(() => {
    const lines = this.validation().warnings.map((issue) => issue.message);
    const onSale = this.stats().onSale;
    if (onSale > 0) {
      const lead = `${productCountLabel(onSale)} ${onSale === 1 ? 'is' : 'are'} already on sale.`;
      lines.push(
        this.draft().saleItems === 'exclude'
          ? `${lead} They keep their sale price and get nothing more.`
          : `${lead} Shoppers get whichever price is lower, never both.`,
      );
    }
    return lines;
  });

  readonly runLine = computed(() => offerRunLine(this.draft().schedule, new Date()));

  readonly limitsText = computed(() => {
    const { totalUses, perCustomer } = this.draft().limits;
    const parts: string[] = [];
    if (totalUses !== null) parts.push(`${totalUses.toLocaleString('en-US')} uses in total`);
    if (perCustomer !== null) parts.push(`${perCustomer} per shopper`);
    return parts.length > 0 ? parts.join(' · ') : 'No limit';
  });

  readonly dealHeadline = computed(() => offerDealPhrase(this.offer()));
  readonly checkSentence = computed(() => offerCheckSentence(this.offer(), this.names(), new Date()));

  /** Step 4 rows: label, value and the step its Change link opens. */
  readonly checkRows = computed(() => {
    const offer = this.offer();
    const target = offerTargetPhrase(offer.conditions, offer.exclude, this.names());
    const { startsAt, endsAt } = offer.schedule;
    const start = startsAt ? cairoShort(startsAt) : 'Right away';
    const end = endsAt ? cairoShort(endsAt) : 'until turned off';
    const days = endsAt ? ` (${daysLabel(runDays(startsAt ?? new Date(), endsAt))})` : '';
    const extras = [
      this.bannerText() ? 'In the top banner' : 'Not in the top banner',
      this.limitsText() === 'No limit' ? 'no use limit' : this.limitsText(),
    ];
    return [
      {
        label: 'The deal',
        value: `${this.dealHeadline()} · shoppers read “${offer.title}”`,
        step: 1 as const,
      },
      {
        label: 'Affected products',
        value: `${this.affectedLabel()} · ${target ?? 'every product'}`,
        step: 2 as const,
      },
      {
        label: 'Who',
        value: offer.audience === 'signedIn' ? 'Signed-in shoppers only' : 'Everyone',
        step: 3 as const,
      },
      { label: 'When', value: `${start} → ${end}${days}`, step: 3 as const },
      { label: 'Extras', value: extras.join(' · '), step: 3 as const },
    ];
  });

  readonly startsLater = computed(() => {
    const startsAt = this.draft().schedule.startsAt;
    return !!startsAt && startsAt.getTime() > Date.now();
  });

  readonly mainLabel = computed(() => {
    if (this.offerId() && this.wasActive()) return 'Save Changes';
    return this.startsLater() ? 'Schedule Offer' : 'Start Offer';
  });

  readonly startNote = computed(() => {
    const startsAt = this.draft().schedule.startsAt;
    if (!this.startsLater() || !startsAt) return null;
    return `It starts by itself on ${cairoShort(startsAt)}.`;
  });

  constructor() {
    effect(() => {
      const value = this.editorResource.value();
      if (!value) return;
      const targetId = this.offerId() ?? 'new';
      if (this.#hydratedOfferId === targetId) return;
      this.#hydratedOfferId = targetId;

      untracked(() => {
        if (value.offer) {
          const draft = withoutStackSaleItems({ ...value.offer });
          this.draft.set(draft);
          // An existing offer opens on Check and start, with every step finished.
          this.step.set(4);
          this.furthest.set(4);
          this.titleEdited.set(true);
          this.nameEdited.set(true);
          this.productsMode.set(draft.conditions.anyOf.length > 0 ? 'some' : 'all');
          this.wasActive.set(draft.active);
          this.limitOpen.set(draft.limits.totalUses !== null || draft.limits.perCustomer !== null);
        } else {
          this.draft.set(createEmptyOfferDraft());
          this.step.set(1);
          this.furthest.set(1);
          this.titleEdited.set(false);
          this.nameEdited.set(false);
          this.productsMode.set('all');
          this.wasActive.set(false);
        }
      });
    });
  }

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Offer Builder | Atteya Admin',
      description: 'Create and preview store offers and discounts.',
      noindex: true,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Moving between steps
  // ---------------------------------------------------------------------------------------------

  next(): void {
    const step = this.step();
    if (step === 4 || !this.stepValid()(step)) return;
    this.#goTo((step + 1) as OfferEditorStep);
  }

  back(): void {
    const step = this.step();
    if (step > 1) this.#goTo((step - 1) as OfferEditorStep);
  }

  goTo(step: OfferEditorStep): void {
    if (this.doneSteps().includes(step)) this.#goTo(step);
  }

  #goTo(step: OfferEditorStep): void {
    this.step.set(step);
    if (step > this.furthest()) this.furthest.set(step);
    afterNextRender(
      () => {
        const heading = this.stepHeading()?.nativeElement;
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: 'center' });
      },
      { injector: this.#injector },
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------------------------

  pickDeal(kind: RewardPickerKind): void {
    if (kind === this.pickedDeal()) return;
    const { reward, scope, minimum } = defaultDealFor(kind);
    this.draft.update((prev) => ({ ...prev, reward, scope, minimum }));
  }

  updateReward(reward: OfferReward): void {
    this.draft.update((prev) => ({ ...prev, reward }));
  }

  updateScope(scope: OfferScope): void {
    this.draft.update((prev) => ({ ...prev, scope }));
  }

  updateMinimum(minimum: OfferMinimum | null): void {
    this.draft.update((prev) => ({ ...prev, minimum }));
  }

  onTitleInput(event: Event): void {
    const title = (event.target as HTMLInputElement).value;
    this.titleEdited.set(true);
    this.draft.update((prev) => ({ ...prev, title }));
  }

  onNameInput(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.nameEdited.set(true);
    this.draft.update((prev) => ({ ...prev, name }));
  }

  setProductsMode(mode: ProductsMode): void {
    if (mode === this.productsMode()) return;
    this.productsMode.set(mode);
    if (mode === 'all') {
      this.#savedInclude.set(this.draft().conditions);
      this.draft.update((prev) => ({ ...prev, conditions: { anyOf: [] } }));
    } else {
      const saved = this.#savedInclude();
      this.draft.update((prev) => ({ ...prev, conditions: saved }));
    }
  }

  updateConditions(conditions: OfferConditions): void {
    this.draft.update((prev) => ({ ...prev, conditions }));
  }

  updateExclude(exclude: OfferConditions): void {
    this.draft.update((prev) => ({ ...prev, exclude }));
  }

  setAudience(audience: OfferAudience): void {
    this.draft.update((prev) => ({
      ...prev,
      audience,
      // Only offers for everyone can show in the top banner.
      ...(audience !== 'everyone' && prev.banner?.show ? { banner: { ...prev.banner, show: false } } : {}),
    }));
  }

  updateSchedule(schedule: OfferSchedule): void {
    this.draft.update((prev) => ({ ...prev, schedule }));
  }

  updateBanner(banner: OfferBanner): void {
    this.draft.update((prev) => ({ ...prev, banner }));
  }

  onLimitChange(bound: 'totalUses' | 'perCustomer', event: Event): void {
    const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.draft.update((prev) => ({ ...prev, limits: { ...prev.limits, [bound]: value } }));
  }

  // ---------------------------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------------------------

  /** Save as Draft and Save, Don't Start save the offer turned off; the main button turns it on. */
  async save(active: boolean): Promise<void> {
    if (this.isSaving()) return;
    const firstError = this.#errors()[0];
    if (firstError) {
      this.#snackbar.error(firstError.message);
      if (firstError.step !== this.step()) this.#goTo(firstError.step);
      return;
    }

    const label = this.mainLabel();
    this.isSaving.set(true);
    try {
      await this.#offersAdmin.saveOffer(withoutEmptyFreeItemRules({ ...this.offer(), active }));
      this.#snackbar.success(
        !active
          ? "Offer saved. It's turned off."
          : label === 'Save Changes'
            ? 'Changes saved.'
            : label === 'Schedule Offer'
              ? 'Offer scheduled.'
              : 'Offer started.',
      );
      await this.#router.navigate(['/admin/offers']);
    } catch {
      this.#snackbar.error("We couldn't save this offer. Please try again.");
    } finally {
      this.isSaving.set(false);
    }
  }

  #errorsWhere(match: (code: string, step: OfferEditorStep) => boolean): readonly string[] {
    return this.#errors()
      .filter((issue) => match(issue.code, issue.step))
      .map((issue) => issue.message);
  }

  readonly dealCards = DEAL_CARDS;
}
