import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import {
  DEFAULT_OFFER_BANNER,
  validateOffer,
  type OfferBanner,
  type OfferConditions,
  type OfferDraft,
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
import { ProductsAdminService } from '../products-manager/services/products-admin.service';
import { BannerEditorComponent } from './components/banner-editor/banner-editor.component';
import { ConditionGroupEditorComponent } from './components/condition-group-editor/condition-group-editor.component';
import { OfferPreviewComponent } from './components/offer-preview/offer-preview.component';
import { OfferSettingsComponent } from './components/offer-settings/offer-settings.component';
import { RewardEditorComponent } from './components/reward-editor/reward-editor.component';
import { ScheduleEditorComponent } from './components/schedule-editor/schedule-editor.component';
import {
  createEmptyOfferDraft,
  isUnavailableDeal,
  UNAVAILABLE_DEAL_MESSAGE,
  withoutEmptyFreeItemRules,
  withoutStackSaleItems,
} from './models/offer-admin.model';
import { OffersAdminService } from './services/offers-admin.service';

@Component({
  selector: 'app-offer-editor-page',
  host: { class: 'block w-full' },
  imports: [
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    SkeletonComponent,
    OfferSettingsComponent,
    RewardEditorComponent,
    ConditionGroupEditorComponent,
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

  readonly draft = signal<OfferDraft>(createEmptyOfferDraft());
  readonly isSaving = signal(false);
  #hydratedOfferId: string | null = null;

  readonly editorResource = resource({
    params: () => ({ offerId: this.offerId() ?? null }),
    loader: async ({ params }) => {
      if (!isPlatformBrowser(this.#platformId)) {
        return {
          offer: null,
          offers: [],
          products: [],
          categories: [],
          brands: [],
        };
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

  readonly pricedProducts = computed(() => this.products().map((product) => toPricedProduct(product)));

  readonly validation = computed(() =>
    validateOffer(this.draft(), this.pricedProducts(), this.otherOffers(), {
      now: new Date(),
      signedIn: true,
    }),
  );

  /** Top banner settings; an offer saved before the banner existed starts switched off. */
  readonly banner = computed(() => this.draft().banner ?? DEFAULT_OFFER_BANNER);

  /** True for an old offer of a deal type hidden for launch: it opens but Save Offer stays off. */
  readonly isUnavailableDeal = computed(() => isUnavailableDeal(this.draft().reward, this.draft().scope));

  readonly pageHeading = computed(() => (this.offerId() ? 'Edit offer' : 'Create offer'));

  constructor() {
    effect(() => {
      const value = this.editorResource.value();
      if (!value) return;
      const targetId = this.offerId() ?? 'new';
      if (this.#hydratedOfferId === targetId) return;
      this.#hydratedOfferId = targetId;

      untracked(() => {
        if (value.offer) {
          this.draft.set(withoutStackSaleItems({ ...value.offer }));
        } else {
          this.draft.set(createEmptyOfferDraft());
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

  updateReward(reward: OfferReward): void {
    this.draft.update((prev) => ({ ...prev, reward }));
  }

  updateScope(scope: OfferScope): void {
    this.draft.update((prev) => ({ ...prev, scope }));
  }

  updateMinimum(minimum: OfferMinimum | null): void {
    this.draft.update((prev) => ({ ...prev, minimum }));
  }

  updateConditions(conditions: OfferConditions): void {
    this.draft.update((prev) => ({ ...prev, conditions }));
  }

  updateExclude(exclude: OfferConditions): void {
    this.draft.update((prev) => ({ ...prev, exclude }));
  }

  updateSchedule(schedule: OfferSchedule): void {
    this.draft.update((prev) => ({ ...prev, schedule }));
  }

  updateBanner(banner: OfferBanner): void {
    this.draft.update((prev) => ({ ...prev, banner }));
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    if (this.isUnavailableDeal()) {
      this.#snackbar.error(UNAVAILABLE_DEAL_MESSAGE);
      return;
    }
    if (this.validation().errors.length > 0) {
      this.#snackbar.error(this.validation().errors[0].message);
      return;
    }

    this.isSaving.set(true);
    try {
      await this.#offersAdmin.saveOffer(withoutEmptyFreeItemRules(this.draft()));
      this.#snackbar.success('Offer saved.');
      await this.#router.navigate(['/admin/offers']);
    } catch {
      this.#snackbar.error("We couldn't save this offer. Please try again.");
    } finally {
      this.isSaving.set(false);
    }
  }
}
