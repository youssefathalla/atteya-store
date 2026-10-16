import { HomeHero, HeroAction } from '../models/home-manager.model';

/**
 * Validates a single hero action button.
 * Cognitive Complexity: 2
 */
export function validateHeroAction(action: HeroAction, index: number): string | null {
  if (!action.label || action.label.trim().length === 0) {
    return `Action #${index + 1} requires a button label.`;
  }
  if (!action.link || action.link.trim().length === 0) {
    return `Action "${action.label}" requires a destination URL or route path.`;
  }
  return null;
}

/**
 * Validates hero banner draft before publishing.
 * Cognitive Complexity: 4
 */
export function validateHomeHeroDraft(hero: HomeHero): string | null {
  if (!hero.headline || hero.headline.trim().length < 3) {
    return 'Hero banner headline must be at least 3 characters long.';
  }
  if (!hero.subtitle || hero.subtitle.trim().length === 0) {
    return 'Hero banner subtitle cannot be empty.';
  }
  if (!hero.imageUrl || hero.imageUrl.trim().length === 0) {
    return 'Hero background image path/URL cannot be empty.';
  }
  if (!hero.actions || hero.actions.length === 0) {
    return 'Hero banner must have at least one call-to-action button.';
  }

  for (let i = 0; i < hero.actions.length; i++) {
    const err = validateHeroAction(hero.actions[i], i);
    if (err) return err;
  }

  return null;
}
