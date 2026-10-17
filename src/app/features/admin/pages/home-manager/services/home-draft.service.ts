import { computed, Service, signal } from '@angular/core';
import { StorageAssetTracker } from '@core/services/storage';
import { DEFAULT_HERO_SLIDES } from '@features/home/data/home.data';
import {
  HeroAction,
  HeroLayoutCount,
  HeroSlide,
  HomeHero,
} from '../models/home-manager.model';

function cloneSlide(slide: HeroSlide): HeroSlide {
  return {
    ...slide,
    actions: slide.actions.map((a) => ({ ...a })),
  };
}

function buildThreeSlots(source: HomeHero): HeroSlide[] {
  return [0, 1, 2].map((idx) =>
    cloneSlide(source.slides[idx] ?? DEFAULT_HERO_SLIDES[idx] ?? DEFAULT_HERO_SLIDES[0]),
  );
}

@Service()
export class HomeDraftService {
  readonly #layoutCount = signal<HeroLayoutCount>(1);
  readonly #slots = signal<readonly HeroSlide[]>(
    DEFAULT_HERO_SLIDES.map((s) => cloneSlide(s)),
  );
  readonly #activeSlotIndex = signal<number>(0);
  readonly #isDirty = signal<boolean>(false);
  readonly #assetTracker = new StorageAssetTracker();

  readonly layoutCount = computed<HeroLayoutCount>(() => this.#layoutCount());
  readonly activeSlotIndex = computed<number>(() => this.#activeSlotIndex());

  readonly activeSlides = computed<HeroSlide[]>(() =>
    this.#slots().slice(0, this.#layoutCount()),
  );

  readonly activeSlide = computed<HeroSlide>(
    () => this.#slots()[this.#activeSlotIndex()] ?? this.#slots()[0],
  );

  /**
   * Represents the exact HomeHero payload that will be rendered in the preview
   * and persisted to Firestore on Publish (trimmed to `layoutCount`).
   */
  readonly draftHero = computed<HomeHero>(() => ({
    layoutCount: this.#layoutCount(),
    slides: this.activeSlides(),
  }));

  readonly isDirty = computed(() => this.#isDirty());

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

  /**
   * Records a newly uploaded Storage path in the current editing session
   * so it can be cleaned up if replaced, discarded, or trimmed on publish.
   */
  registerSessionUpload(path: string): void {
    this.#assetTracker.register(path);
  }

  /**
   * Computes all Storage paths (from previous live version + current draft session)
   * that are NOT part of the newly published `draftHero()` so they can be deleted.
   */
  getOrphanedPathsForPublish(previousLiveHero: HomeHero): string[] {
    return this.#assetTracker.orphansOnPublish(
      previousLiveHero.slides.map((s) => s.imageUrl),
      this.draftHero().slides.map((s) => s.imageUrl),
    );
  }

  /**
   * Computes all uncommitted session uploads that are not in the live hero
   * so they can be deleted when discarding draft changes.
   */
  getOrphanedPathsForDiscard(liveHero: HomeHero): string[] {
    return this.#assetTracker.orphansOnDiscard(
      liveHero.slides.map((s) => s.imageUrl),
    );
  }

  /**
   * Computes all uploaded images from both live hero and draft session
   * so they can be deleted when resetting to factory defaults.
   */
  getOrphanedPathsForReset(liveHero: HomeHero): string[] {
    return this.#assetTracker.orphansOnReset(
      liveHero.slides.map((s) => s.imageUrl),
    );
  }

  resetDraftFromSource(hero: HomeHero): void {
    this.#layoutCount.set(hero.layoutCount);
    this.#slots.set(buildThreeSlots(hero));
    this.#activeSlotIndex.set(0);
    this.#assetTracker.clear();
    this.#isDirty.set(false);
  }

  discardDraft(sourceHero: HomeHero): void {
    this.resetDraftFromSource(sourceHero);
  }

  markSaved(): void {
    this.#assetTracker.clear();
    this.#isDirty.set(false);
  }
}
