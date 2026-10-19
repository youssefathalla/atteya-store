import { computed, Service, signal } from '@angular/core';
import { StorageAssetTracker } from '@core/services/storage';
import {
  DEFAULT_HERO_SLIDES,
  DEFAULT_HOME_SHOP_CATEGORIES,
  DEFAULT_SHOP_CATEGORY_CARDS,
  SHOP_CATEGORIES_CARD_COUNT,
} from '@features/home/data/home.data';
import {
  HeroAction,
  HeroLayoutCount,
  HeroSlide,
  HomeHero,
  HomeSectionTab,
  HomeShopCategories,
  ShopCategoryCard,
} from '../models/home-manager.model';

function cloneSlide(slide: HeroSlide): HeroSlide {
  return {
    ...slide,
    actions: slide.actions.map((a) => ({ ...a })),
  };
}

function buildThreeHeroSlots(source: HomeHero): HeroSlide[] {
  return [0, 1, 2].map((idx) =>
    cloneSlide(source.slides[idx] ?? DEFAULT_HERO_SLIDES[idx] ?? DEFAULT_HERO_SLIDES[0]),
  );
}

function cloneCategoryCard(card: ShopCategoryCard): ShopCategoryCard {
  return { ...card };
}

function buildThreeCategoryCards(source: HomeShopCategories): ShopCategoryCard[] {
  return [0, 1, 2].map((idx) =>
    cloneCategoryCard(
      source.cards[idx] ??
        DEFAULT_SHOP_CATEGORY_CARDS[idx] ??
        DEFAULT_SHOP_CATEGORY_CARDS[0],
    ),
  );
}

@Service()
export class HomeDraftService {
  readonly #activeSection = signal<HomeSectionTab>('hero');

  // Section 1: Hero State
  readonly #layoutCount = signal<HeroLayoutCount>(1);
  readonly #slots = signal<readonly HeroSlide[]>(
    DEFAULT_HERO_SLIDES.map((s) => cloneSlide(s)),
  );
  readonly #activeSlotIndex = signal<number>(0);

  // Section 2: Shop Categories State
  readonly #shopTitle = signal<string>(DEFAULT_HOME_SHOP_CATEGORIES.title);
  readonly #shopCards = signal<readonly ShopCategoryCard[]>(
    DEFAULT_SHOP_CATEGORY_CARDS.map((c) => cloneCategoryCard(c)),
  );
  readonly #activeShopCardIndex = signal<number>(0);

  readonly #isDirty = signal<boolean>(false);
  readonly #assetTracker = new StorageAssetTracker();

  readonly activeSection = this.#activeSection.asReadonly();
  readonly layoutCount = computed<HeroLayoutCount>(() => this.#layoutCount());
  readonly activeSlotIndex = computed<number>(() => this.#activeSlotIndex());

  readonly activeSlides = computed<HeroSlide[]>(() =>
    this.#slots().slice(0, this.#layoutCount()),
  );

  readonly activeSlide = computed<HeroSlide>(
    () => this.#slots()[this.#activeSlotIndex()] ?? this.#slots()[0],
  );

  readonly draftHero = computed<HomeHero>(() => ({
    layoutCount: this.#layoutCount(),
    slides: this.activeSlides(),
  }));

  readonly shopTitle = this.#shopTitle.asReadonly();
  readonly activeShopCardIndex = this.#activeShopCardIndex.asReadonly();
  readonly shopCards = computed<readonly ShopCategoryCard[]>(() =>
    this.#shopCards().slice(0, SHOP_CATEGORIES_CARD_COUNT),
  );

  readonly activeShopCard = computed<ShopCategoryCard>(
    () => this.#shopCards()[this.#activeShopCardIndex()] ?? this.#shopCards()[0],
  );

  readonly draftShopCategories = computed<HomeShopCategories>(() => ({
    title: this.#shopTitle(),
    cards: [...this.shopCards()],
  }));

  readonly isDirty = computed(() => this.#isDirty());

  setActiveSection(section: HomeSectionTab): void {
    this.#activeSection.set(section);
  }

  // --- Section 1: Hero Mutations ---

  setLayoutCount(count: HeroLayoutCount): void {
    if (this.#layoutCount() === count) return;
    this.#layoutCount.set(count);
    if (this.#activeSlotIndex() >= count) {
      this.#activeSlotIndex.set(count - 1);
    }
    this.#isDirty.set(true);
  }

  setActiveSlot(index: number): void {
    if (index >= 0 && index < this.#layoutCount()) {
      this.#activeSlotIndex.set(index);
    }
  }

  #updateCurrentSlot(updater: (slide: HeroSlide) => HeroSlide): void {
    const idx = this.#activeSlotIndex();
    this.#slots.update((prev) =>
      prev.map((slide, i) => (i === idx ? updater(slide) : slide)),
    );
    this.#isDirty.set(true);
  }

  updateHeadline(headline: string): void {
    this.#updateCurrentSlot((slide) => ({ ...slide, headline }));
  }

  updateSubtitle(subtitle: string): void {
    this.#updateCurrentSlot((slide) => ({ ...slide, subtitle }));
  }

  updateImageUrl(imageUrl: string): void {
    this.#updateCurrentSlot((slide) => ({ ...slide, imageUrl }));
  }

  updateImageAlt(imageAlt: string): void {
    this.#updateCurrentSlot((slide) => ({ ...slide, imageAlt }));
  }

  addAction(action: HeroAction): void {
    this.#updateCurrentSlot((slide) => ({
      ...slide,
      actions: [...slide.actions, action],
    }));
  }

  updateAction(index: number, action: HeroAction): void {
    this.#updateCurrentSlot((slide) => {
      const actions = [...slide.actions];
      if (index >= 0 && index < actions.length) {
        actions[index] = action;
      }
      return { ...slide, actions };
    });
  }

  removeAction(index: number): void {
    this.#updateCurrentSlot((slide) => ({
      ...slide,
      actions: slide.actions.filter((_, i) => i !== index),
    }));
  }

  moveAction(index: number, direction: 'up' | 'down'): void {
    const target = direction === 'up' ? index - 1 : index + 1;
    this.#updateCurrentSlot((slide) => {
      const actions = [...slide.actions];
      if (target < 0 || target >= actions.length) return slide;
      const temp = actions[index];
      actions[index] = actions[target];
      actions[target] = temp;
      return { ...slide, actions };
    });
  }

  // --- Section 2: Shop Categories Mutations ---

  setActiveShopCard(index: number): void {
    if (index >= 0 && index < SHOP_CATEGORIES_CARD_COUNT) {
      this.#activeShopCardIndex.set(index);
    }
  }

  updateShopTitle(title: string): void {
    this.#shopTitle.set(title);
    this.#isDirty.set(true);
  }

  #updateCurrentShopCard(updater: (card: ShopCategoryCard) => ShopCategoryCard): void {
    const idx = this.#activeShopCardIndex();
    this.#shopCards.update((prev) =>
      prev.map((card, i) => (i === idx ? updater(card) : card)),
    );
    this.#isDirty.set(true);
  }

  updateShopCardImageUrl(imageUrl: string): void {
    this.#updateCurrentShopCard((card) => ({ ...card, imageUrl }));
  }

  updateShopCardImageAlt(imageAlt: string): void {
    this.#updateCurrentShopCard((card) => ({ ...card, imageAlt }));
  }

  updateShopCardButtonLabel(buttonLabel: string): void {
    this.#updateCurrentShopCard((card) => ({ ...card, buttonLabel }));
  }

  updateShopCardButtonLink(buttonLink: string): void {
    this.#updateCurrentShopCard((card) => ({ ...card, buttonLink }));
  }

  // --- Session Upload Tracking & Orphan Cleanup ---

  registerSessionUpload(path: string): void {
    this.#assetTracker.register(path);
  }

  getOrphanedPathsForPublish(
    previousLiveHero: HomeHero,
    previousLiveShop: HomeShopCategories,
  ): string[] {
    const previousUrls = [
      ...previousLiveHero.slides.map((s) => s.imageUrl),
      ...previousLiveShop.cards.map((c) => c.imageUrl),
    ];
    const keptUrls = [
      ...this.draftHero().slides.map((s) => s.imageUrl),
      ...this.draftShopCategories().cards.map((c) => c.imageUrl),
    ];
    return this.#assetTracker.orphansOnPublish(previousUrls, keptUrls);
  }

  getOrphanedPathsForDiscard(
    liveHero: HomeHero,
    liveShop: HomeShopCategories,
  ): string[] {
    return this.#assetTracker.orphansOnDiscard([
      ...liveHero.slides.map((s) => s.imageUrl),
      ...liveShop.cards.map((c) => c.imageUrl),
    ]);
  }

  getOrphanedPathsForReset(
    liveHero: HomeHero,
    liveShop: HomeShopCategories,
  ): string[] {
    return this.#assetTracker.orphansOnReset([
      ...liveHero.slides.map((s) => s.imageUrl),
      ...liveShop.cards.map((c) => c.imageUrl),
    ]);
  }

  resetDraftFromSource(hero: HomeHero, shopCategories: HomeShopCategories): void {
    this.#layoutCount.set(hero.layoutCount);
    this.#slots.set(buildThreeHeroSlots(hero));
    this.#activeSlotIndex.set(0);

    this.#shopTitle.set(shopCategories.title || DEFAULT_HOME_SHOP_CATEGORIES.title);
    this.#shopCards.set(buildThreeCategoryCards(shopCategories));
    this.#activeShopCardIndex.set(0);

    this.#assetTracker.clear();
    this.#isDirty.set(false);
  }

  discardDraft(sourceHero: HomeHero, sourceShop: HomeShopCategories): void {
    this.resetDraftFromSource(sourceHero, sourceShop);
  }

  markSaved(): void {
    this.#assetTracker.clear();
    this.#isDirty.set(false);
  }
}
