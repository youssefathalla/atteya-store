import { pathOpensDeletedBuiltIn } from '@core/services/products/utils/deleted-built-ins';
import type { HomeHero, HomeNavList, HomeShopCategories } from '../models/home.model';

/**
 * The built-in home sections (`DEFAULT_HOME_*`) without links to built-in categories and brands
 * staff deleted (ATS-265). Only the built-in defaults go through these; a saved home page is
 * shown as staff saved it. Pure: no Angular.
 */

/** Hero buttons that open a deleted built-in are left out; the slide stays. */
export function heroWithoutDeleted(hero: HomeHero, deleted: ReadonlySet<string>): HomeHero {
  if (deleted.size === 0) return hero;
  return {
    ...hero,
    slides: hero.slides.map((slide) => ({
      ...slide,
      actions: slide.actions.filter((action) => !pathOpensDeletedBuiltIn(action.link, deleted)),
    })),
  };
}

/** The shop cards are always three, so a card for a deleted built-in opens Shop All instead. */
export function shopCardsWithoutDeleted(
  section: HomeShopCategories,
  deleted: ReadonlySet<string>,
): HomeShopCategories {
  if (deleted.size === 0) return section;
  return {
    ...section,
    cards: section.cards.map((card) =>
      pathOpensDeletedBuiltIn(card.buttonLink, deleted)
        ? { ...card, buttonLabel: 'Shop All', buttonLink: '/shop' }
        : card,
    ),
  };
}

/** Category list rows that open a deleted built-in are left out. */
export function navListWithoutDeleted(list: HomeNavList, deleted: ReadonlySet<string>): HomeNavList {
  if (deleted.size === 0) return list;
  return { ...list, items: list.items.filter((item) => !pathOpensDeletedBuiltIn(item.link, deleted)) };
}
