import { computed, Service, signal } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { StorageAssetTracker } from '@core/services/storage';
import { NavCategory } from '@core/services/navigation';
import {
  DEFAULT_HERO_SLIDES,
  DEFAULT_HOME_NAV_LIST,
  DEFAULT_HOME_SHOP_CATEGORIES,
  DEFAULT_SHOP_CATEGORY_CARDS,
  NAV_LIST_MAX_ITEMS,
  SHOP_CATEGORIES_CARD_COUNT,
} from '@features/home/data/home.data';
import {
  HeroAction,
  HeroLayoutCount,
  HeroSlide,
  HomeHero,
  HomeNavList,
  HomeNavListItem,
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
      source.cards[idx] ?? DEFAULT_SHOP_CATEGORY_CARDS[idx] ?? DEFAULT_SHOP_CATEGORY_CARDS[0],
    ),
  );
}

const EMPTY_NAV_ITEM: HomeNavListItem = {
  label: '',
  link: '/',
  imageUrl: '',
  imageAlt: '',
};

function cloneNavItem(item: HomeNavListItem): HomeNavListItem {
  return {
    label: item.label,
    link: item.link,
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt ?? '',
  };
}

function buildNavItems(source: HomeNavList): HomeNavListItem[] {
  return source.items.slice(0, NAV_LIST_MAX_ITEMS).map((item) => cloneNavItem(item));
}

function nextActiveIndex(active: number, from: number, to: number): number {
  if (from === active) return to;
  if (from < active && to >= active) return active - 1;
  if (from > active && to <= active) return active + 1;
  return active;
}

@Service()
export class HomeDraftService {
  readonly #activeSection = signal<HomeSectionTab>('hero');

  // Section 1: Hero State
  readonly #layoutCount = signal<HeroLayoutCount>(1);
  readonly #slots = signal<readonly HeroSlide[]>(DEFAULT_HERO_SLIDES.map((s) => cloneSlide(s)));
  readonly #activeSlotIndex = signal<number>(0);

  // Section 2: Shop Categories State
  readonly #shopTitle = signal<string>(DEFAULT_HOME_SHOP_CATEGORIES.title);
  readonly #shopCards = signal<readonly ShopCategoryCard[]>(
    DEFAULT_SHOP_CATEGORY_CARDS.map((c) => cloneCategoryCard(c)),
  );
  readonly #activeShopCardIndex = signal<number>(0);

  // Section 3: Category list
  readonly #navTitle = signal<string>(DEFAULT_HOME_NAV_LIST.title);
  readonly #navItems = signal<readonly HomeNavListItem[]>(
    DEFAULT_HOME_NAV_LIST.items.map((item) => cloneNavItem(item)),
  );
  readonly #activeNavIndex = signal<number>(0);

  readonly #isDirty = signal<boolean>(false);
  readonly #assetTracker = new StorageAssetTracker();

  readonly activeSection = this.#activeSection.asReadonly();
  readonly layoutCount = computed<HeroLayoutCount>(() => this.#layoutCount());
  readonly activeSlotIndex = computed<number>(() => this.#activeSlotIndex());

  readonly activeSlides = computed<HeroSlide[]>(() => this.#slots().slice(0, this.#layoutCount()));

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

  readonly navTitle = this.#navTitle.asReadonly();
  readonly navItems = this.#navItems.asReadonly();
  readonly activeNavIndex = this.#activeNavIndex.asReadonly();
  readonly activeNavItem = computed<HomeNavListItem>(
    () => this.#navItems()[this.#activeNavIndex()] ?? this.#navItems()[0] ?? EMPTY_NAV_ITEM,
  );
  readonly draftNavList = computed<HomeNavList>(() => ({
    title: this.#navTitle(),
    items: this.#navItems().map((item) => cloneNavItem(item)),
  }));
  readonly navListIsFull = computed(() => this.#navItems().length >= NAV_LIST_MAX_ITEMS);

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
    this.#slots.update((prev) => prev.map((slide, i) => (i === idx ? updater(slide) : slide)));
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
    this.#shopCards.update((prev) => prev.map((card, i) => (i === idx ? updater(card) : card)));
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

  // --- Section 3: Category list mutations ---

  setActiveNavItem(index: number): void {
    if (index >= 0 && index < this.#navItems().length) {
      this.#activeNavIndex.set(index);
    }
  }

  updateNavTitle(title: string): void {
    this.#navTitle.set(title);
    this.#isDirty.set(true);
  }

  #updateCurrentNavItem(updater: (item: HomeNavListItem) => HomeNavListItem): void {
    const idx = this.#activeNavIndex();
    this.#navItems.update((prev) => prev.map((item, i) => (i === idx ? updater(item) : item)));
    this.#isDirty.set(true);
  }

  updateNavLabel(label: string): void {
    this.#updateCurrentNavItem((item) => ({ ...item, label }));
  }

  updateNavLink(link: string): void {
    this.#updateCurrentNavItem((item) => ({ ...item, link }));
  }

  updateNavImageUrl(imageUrl: string): void {
    this.#updateCurrentNavItem((item) => ({ ...item, imageUrl }));
  }

  updateNavImageAlt(imageAlt: string): void {
    this.#updateCurrentNavItem((item) => ({ ...item, imageAlt }));
  }

  addNavItem(): void {
    if (this.#navItems().length >= NAV_LIST_MAX_ITEMS) return;
    this.#navItems.update((items) => [...items, { ...EMPTY_NAV_ITEM }]);
    this.#activeNavIndex.set(this.#navItems().length - 1);
    this.#isDirty.set(true);
  }

  removeNavItem(index: number): void {
    const current = this.#navItems();
    if (index < 0 || index >= current.length) return;
    this.#navItems.set(current.filter((_, i) => i !== index));
    const nextLength = this.#navItems().length;
    if (nextLength === 0) {
      this.#activeNavIndex.set(0);
    } else if (this.#activeNavIndex() > index) {
      this.#activeNavIndex.set(this.#activeNavIndex() - 1);
    } else if (this.#activeNavIndex() >= nextLength) {
      this.#activeNavIndex.set(nextLength - 1);
    }
    this.#isDirty.set(true);
  }

  moveNavItem(index: number, direction: 'up' | 'down'): void {
    const target = direction === 'up' ? index - 1 : index + 1;
    const items = [...this.#navItems()];
    if (target < 0 || target >= items.length) return;
    const moved = items[index];
    items[index] = items[target];
    items[target] = moved;
    this.#navItems.set(items);
    this.#activeNavIndex.set(nextActiveIndex(this.#activeNavIndex(), index, target));
    this.#isDirty.set(true);
  }

  dropNavItem(event: CdkDragDrop<HomeNavListItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const items = [...this.#navItems()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    this.#navItems.set(items);
    this.#activeNavIndex.set(
      nextActiveIndex(this.#activeNavIndex(), event.previousIndex, event.currentIndex),
    );
    this.#isDirty.set(true);
  }

  /**
   * Replaces labels and links with the store menu. Photos are cleared.
   * Returns how many links were imported.
   */
  importNavItems(categories: readonly NavCategory[]): number {
    const items: HomeNavListItem[] = [];
    for (const category of categories) {
      if (items.length >= NAV_LIST_MAX_ITEMS) break;
      const link = category.path ?? '';
      if (!link.startsWith('/') || link.startsWith('//')) continue;
      const label = category.label.trim().slice(0, 40);
      if (!label) continue;
      items.push({ label, link, imageUrl: '', imageAlt: '' });
    }
    if (items.length === 0) return 0;
    this.#navItems.set(items);
    this.#activeNavIndex.set(0);
    this.#isDirty.set(true);
    return items.length;
  }

  // --- Session Upload Tracking & Orphan Cleanup ---

  registerSessionUpload(path: string): void {
    this.#assetTracker.register(path);
  }

  getOrphanedPathsForPublish(
    previousLiveHero: HomeHero,
    previousLiveShop: HomeShopCategories,
    previousLiveNav: HomeNavList,
  ): string[] {
    return this.#assetTracker.orphansOnPublish(
      this.#imageUrls(previousLiveHero, previousLiveShop, previousLiveNav),
      this.#imageUrls(this.draftHero(), this.draftShopCategories(), this.draftNavList()),
    );
  }

  getOrphanedPathsForDiscard(
    liveHero: HomeHero,
    liveShop: HomeShopCategories,
    liveNav: HomeNavList,
  ): string[] {
    return this.#assetTracker.orphansOnDiscard(this.#imageUrls(liveHero, liveShop, liveNav));
  }

  getOrphanedPathsForReset(liveHero: HomeHero, liveShop: HomeShopCategories, liveNav: HomeNavList): string[] {
    return this.#assetTracker.orphansOnReset(this.#imageUrls(liveHero, liveShop, liveNav));
  }

  resetDraftFromSource(hero: HomeHero, shopCategories: HomeShopCategories, navList: HomeNavList): void {
    this.#layoutCount.set(hero.layoutCount);
    this.#slots.set(buildThreeHeroSlots(hero));
    this.#activeSlotIndex.set(0);

    this.#shopTitle.set(shopCategories.title || DEFAULT_HOME_SHOP_CATEGORIES.title);
    this.#shopCards.set(buildThreeCategoryCards(shopCategories));
    this.#activeShopCardIndex.set(0);

    this.#navTitle.set(navList.title.trim() || DEFAULT_HOME_NAV_LIST.title);
    this.#navItems.set(buildNavItems(navList));
    this.#activeNavIndex.set(0);

    this.#assetTracker.clear();
    this.#isDirty.set(false);
  }

  discardDraft(sourceHero: HomeHero, sourceShop: HomeShopCategories, sourceNav: HomeNavList): void {
    this.resetDraftFromSource(sourceHero, sourceShop, sourceNav);
  }

  #imageUrls(hero: HomeHero, shop: HomeShopCategories, navList: HomeNavList): string[] {
    return [
      ...hero.slides.map((slide) => slide.imageUrl),
      ...shop.cards.map((card) => card.imageUrl),
      ...navList.items.map((item) => item.imageUrl),
    ];
  }

  markSaved(): void {
    this.#assetTracker.clear();
    this.#isDirty.set(false);
  }
}
