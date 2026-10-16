import { computed, Service, signal } from '@angular/core';
import { DEFAULT_HOME_HERO } from '@features/home/data/home.data';
import { HomeHero, HeroAction } from '../models/home-manager.model';

@Service()
export class HomeDraftService {
  readonly #draftHero = signal<HomeHero>(DEFAULT_HOME_HERO);
  readonly #isDirty = signal<boolean>(false);

  readonly draftHero = computed(() => this.#draftHero());
  readonly isDirty = computed(() => this.#isDirty());

  updateHeadline(headline: string): void {
    this.#draftHero.update((prev) => ({ ...prev, headline }));
    this.#isDirty.set(true);
  }

  updateSubtitle(subtitle: string): void {
    this.#draftHero.update((prev) => ({ ...prev, subtitle }));
    this.#isDirty.set(true);
  }

  updateImageUrl(imageUrl: string): void {
    this.#draftHero.update((prev) => ({ ...prev, imageUrl }));
    this.#isDirty.set(true);
  }

  updateImageAlt(imageAlt: string): void {
    this.#draftHero.update((prev) => ({ ...prev, imageAlt }));
    this.#isDirty.set(true);
  }

  addAction(action: HeroAction): void {
    this.#draftHero.update((prev) => ({
      ...prev,
      actions: [...prev.actions, action],
    }));
    this.#isDirty.set(true);
  }

  updateAction(index: number, action: HeroAction): void {
    this.#draftHero.update((prev) => {
      const actions = [...prev.actions];
      if (index >= 0 && index < actions.length) {
        actions[index] = action;
      }
      return { ...prev, actions };
    });
    this.#isDirty.set(true);
  }

  removeAction(index: number): void {
    this.#draftHero.update((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
    this.#isDirty.set(true);
  }

  moveAction(index: number, direction: 'up' | 'down'): void {
    const target = direction === 'up' ? index - 1 : index + 1;
    this.#draftHero.update((prev) => {
      const actions = [...prev.actions];
      if (target < 0 || target >= actions.length) return prev;
      const temp = actions[index];
      actions[index] = actions[target];
      actions[target] = temp;
      return { ...prev, actions };
    });
    this.#isDirty.set(true);
  }

  resetDraftFromSource(hero: HomeHero): void {
    this.#draftHero.set(hero);
    this.#isDirty.set(false);
  }

  discardDraft(sourceHero: HomeHero): void {
    this.#draftHero.set(sourceHero);
    this.#isDirty.set(false);
  }

  markSaved(): void {
    this.#isDirty.set(false);
  }
}
