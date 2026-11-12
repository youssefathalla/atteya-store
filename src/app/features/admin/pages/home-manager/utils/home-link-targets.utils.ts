import {
  outsideLinkProblem,
  resolveNavTarget,
  type NavTarget,
  type NavTargetCatalog,
} from '@core/services/navigation/nav-target';
import { targetAndPath } from '../../navigation-manager/utils/navigation-targets.utils';
import type { HomeHero, HomeNavList, HomeShopCategories } from '../models/home-manager.model';

/**
 * Home Page links as they are saved (ATS-267), like Navigation: each button and link keeps its
 * `target` and the address built from it (`link` / `buttonLink`), so the store's readers and the
 * server seed keep working. An old typed address on our site becomes the target it names.
 */

/** Firestore refuses `undefined`: a link with no target has no `target` key. */
function withTarget<T extends { target?: NavTarget }>(item: T, target: NavTarget | undefined): T {
  const next = { ...item };
  if (target) next.target = target;
  else delete next.target;
  return next;
}

export interface HomeSectionsToSave {
  readonly hero: HomeHero;
  readonly shopCategories: HomeShopCategories;
  readonly navList: HomeNavList;
}

export function homeWithTargets(sections: HomeSectionsToSave, catalog: NavTargetCatalog): HomeSectionsToSave {
  return {
    hero: {
      ...sections.hero,
      slides: sections.hero.slides.map((slide) => ({
        ...slide,
        actions: slide.actions.map((action) => {
          const { target, path } = targetAndPath(action.target, action.link, catalog);
          return withTarget({ ...action, link: path }, target);
        }),
      })),
    },
    shopCategories: {
      ...sections.shopCategories,
      cards: sections.shopCategories.cards.map((card) => {
        const { target, path } = targetAndPath(card.target, card.buttonLink, catalog);
        return withTarget({ ...card, buttonLink: path }, target);
      }),
    },
    navList: {
      ...sections.navList,
      items: sections.navList.items.map((item) => {
        const { target, path } = targetAndPath(item.target, item.link, catalog);
        return withTarget({ ...item, link: path }, target);
      }),
    },
  };
}

/**
 * Why a saved home link can't be published, or null (ATS-267). Checked after `homeWithTargets`,
 * so a link that still has no target couldn't be matched. `catalog` is every category and brand
 * (null while loading: a picked target is then not checked; the store still hides a gone one).
 */
export function homeLinkProblem(
  target: NavTarget | undefined,
  link: string,
  catalog: NavTargetCatalog | null,
  allowOutside: boolean,
): string | null {
  if (!target || (target.kind === 'url' && target.url.trim().startsWith('/'))) {
    return 'pick where it goes';
  }
  if (target.kind === 'url') {
    if (!allowOutside) return 'pick a page on the store';
    const problem = outsideLinkProblem(target.url);
    return problem ? problem.charAt(0).toLowerCase() + problem.slice(1, -1) : null;
  }
  if (!catalog || !link.trim()) return catalog ? 'pick where it goes' : null;
  const { problem } = resolveNavTarget(target, catalog);
  if (problem === 'missing') {
    return target.kind === 'category' ? 'its category no longer exists' : 'its brand no longer exists';
  }
  if (problem === 'ended') return "its offer isn't running now";
  return null;
}
