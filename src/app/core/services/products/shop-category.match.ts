import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import type { CanMatchFn, ResolveFn } from '@angular/router';
import { ShopCategoriesService } from './shop-categories.service';
import { BUILT_IN_SHOP_CATEGORY_IDS, shopCategoryIdForSlug, shopTabFor } from './utils/shop-categories';

/**
 * `/category/:slug` opens the Shop page for every top-level category (the built-in three
 * even while hidden) and the category page for anything else (ATS-249).
 */
export const shopCategoryMatch: CanMatchFn = async (_route, segments) => {
  const slug = segments[1]?.path.trim().toLowerCase() ?? '';
  if (segments.length !== 2 || !slug) return false;
  if (BUILT_IN_SHOP_CATEGORY_IDS.includes(slug)) return true;
  const categories = await inject(ShopCategoriesService).load();
  return shopCategoryIdForSlug(slug, categories) !== null;
};

/** One server read of the published categories, so Shop tabs are in the first HTML. */
export const shopCategoriesResolver: ResolveFn<void> = async () => {
  if (!isPlatformServer(inject(PLATFORM_ID))) return;
  await inject(ShopCategoriesService).load();
};

/**
 * Browser tab title for `/category/:slug` ("Padel | Atteya Store"), so a filter change on the
 * same route never puts a generic title back over the page's own.
 */
export const shopCategoryTitle: ResolveFn<string> = async (route) => {
  const categories = await inject(ShopCategoriesService).load();
  const id = shopCategoryIdForSlug(route.paramMap.get('slug'), categories);
  return id ? `${shopTabFor(id, categories).label} | Atteya Store` : 'Shop | Atteya Store';
};
