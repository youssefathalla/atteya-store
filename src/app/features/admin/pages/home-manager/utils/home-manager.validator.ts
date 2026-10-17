import { diffOrphanedPaths } from '@shared/utils/image';
import { HeroAction, HeroSlide, HomeHero } from '../models/home-manager.model';

/**
 * Validates a single hero action button.
 */
export function validateHeroAction(
  action: HeroAction,
  actionIndex: number,
  prefix: string,
): string | null {
  if (!action.label || action.label.trim().length === 0) {
    return `${prefix}Action #${actionIndex + 1} requires a button label.`;
  }
  if (!action.link || action.link.trim().length === 0) {
    return `${prefix}Button "${action.label}" requires a destination link.`;
  }
  return null;
}

/**
 * Validates a single hero card/slide.
 */
export function validateHeroSlide(
  slide: HeroSlide,
  slideIndex: number,
  totalSlides: number,
): string | null {
  const prefix = totalSlides > 1 ? `Banner #${slideIndex + 1}: ` : '';

  if (!slide.headline || slide.headline.trim().length < 3) {
    return `${prefix}Headline must be at least 3 characters long.`;
  }
  if (!slide.subtitle || slide.subtitle.trim().length === 0) {
    return `${prefix}Subtitle cannot be empty.`;
  }
  if (!slide.imageUrl || slide.imageUrl.trim().length === 0) {
    return `${prefix}Background image cannot be empty.`;
  }
  if (!slide.imageAlt || slide.imageAlt.trim().length === 0) {
    return `${prefix}Please provide an image description (alt text) for accessibility and SEO.`;
  }
  if (!slide.actions || slide.actions.length === 0) {
    return `${prefix}Please add at least one action button.`;
  }

  for (let i = 0; i < slide.actions.length; i++) {
    const err = validateHeroAction(slide.actions[i], i, prefix);
    if (err) return err;
  }

  return null;
}

/**
 * Validates all active hero slides before publishing.
 */
export function validateHomeHeroDraft(hero: HomeHero): string | null {
  const activeSlides = hero.slides.slice(0, hero.layoutCount);
  if (activeSlides.length < hero.layoutCount) {
    return 'Please complete all active banner cards before publishing.';
  }

  for (let i = 0; i < activeSlides.length; i++) {
    const err = validateHeroSlide(activeSlides[i], i, hero.layoutCount);
    if (err) return err;
  }

  return null;
}

/**
 * Computes Firebase Storage paths that are no longer referenced by the kept slides.
 */
export function collectOrphanedStoragePaths(
  candidatePaths: readonly string[],
  keptSlides: readonly HeroSlide[],
): string[] {
  return diffOrphanedPaths(
    candidatePaths,
    keptSlides.map((s) => s.imageUrl),
  );
}
