import { storefrontTargetPath } from '@core/services/navigation/nav-visibility';
import type { NavTargetCatalog } from '@core/services/navigation/nav-target';
import type { HomeHero, HomeNavList, HomeShopCategories } from '../models/home.model';

/**
 * Home buttons and links built from what they point at (ATS-267), the same way as the menus
 * (`resolveStorefrontTargets`): a renamed category's button follows its new address, and one
 * whose category or brand is hidden or deleted is left out. `catalog` is the published
 * categories and brands (`NavService.targetCatalog`), null on the server and until both lists
 * load, when every link keeps its saved address, so the server HTML and first render match.
 * Links saved before targets keep their address. Pure: no Angular.
 */

/** Hero buttons whose target can't be shown are left out; the slide stays. */
export function heroWithTargets(hero: HomeHero, catalog: NavTargetCatalog | null): HomeHero {
  if (!catalog) return hero;
  return {
    ...hero,
    slides: hero.slides.map((slide) => ({
      ...slide,
      actions: slide.actions.flatMap((action) => {
        const link = storefrontTargetPath(action.target, action.link, catalog);
        return link ? [{ ...action, link }] : [];
      }),
    })),
  };
}

/** The shop cards are always three, so a card whose target can't be shown opens Shop All instead. */
export function shopCardsWithTargets(
  section: HomeShopCategories,
  catalog: NavTargetCatalog | null,
): HomeShopCategories {
  if (!catalog) return section;
  return {
    ...section,
    cards: section.cards.map((card) => {
      const buttonLink = storefrontTargetPath(card.target, card.buttonLink, catalog);
      return buttonLink
        ? { ...card, buttonLink }
        : { ...card, buttonLabel: 'Shop All', buttonLink: '/shop', target: undefined };
    }),
  };
}

/** Category list rows whose target can't be shown are left out. */
export function navListWithTargets(list: HomeNavList, catalog: NavTargetCatalog | null): HomeNavList {
  if (!catalog) return list;
  return {
    ...list,
    items: list.items.flatMap((item) => {
      const link = storefrontTargetPath(item.target, item.link, catalog);
      return link ? [{ ...item, link }] : [];
    }),
  };
}
