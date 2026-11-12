import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import type { CanMatchFn, ResolveFn } from '@angular/router';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { CATALOG_DOC } from './product.constants';
import { DELETED_BUILT_IN_FIELD, readDeletedBuiltInIds } from './utils/deleted-built-ins';
import { ShopCategoriesService } from './shop-categories.service';
import { BUILT_IN_SHOP_CATEGORY_IDS, shopCategoryIdForSlug, shopTabFor } from './utils/shop-categories';

/**
 * `/category/:slug` opens the Shop page for every top-level category (the built-in three
 * even while hidden, unless staff deleted them, ATS-265) and the category page for anything else
 * (ATS-249).
 */
export const shopCategoryMatch: CanMatchFn = async (_route, segments) => {
  const slug = segments[1]?.path.trim().toLowerCase() ?? '';
  if (segments.length !== 2 || !slug) return false;
  const firestore = injectFirestore();
  const categories = await inject(ShopCategoriesService).load();
  // A published top-level category (built-ins left out of the fallback, so only a real match counts).
  if (shopCategoryIdForSlug(slug, categories, new Set(BUILT_IN_SHOP_CATEGORY_IDS)) !== null) return true;
  // A built-in that isn't in the published list is hidden or deleted: one read tells which.
  if (!BUILT_IN_SHOP_CATEGORY_IDS.includes(slug)) return false;
  return !(await readDeletedBuiltIns(firestore)).has(slug);
};

/**
 * One read of `settings/catalog.deletedBuiltInIds` (ATS-265), only for a built-in that isn't in the
 * published list. Read here rather than through `CatalogService`, which must not be created before
 * the layout's `catalogSettingsResolver` seeds it on the server. A failed read counts as none.
 */
async function readDeletedBuiltIns(firestore: Firestore): Promise<ReadonlySet<string>> {
  try {
    const snap = await getDoc(doc(firestore, CATALOG_DOC[0], CATALOG_DOC[1]));
    return new Set(readDeletedBuiltInIds(snap.exists() ? snap.get(DELETED_BUILT_IN_FIELD) : null));
  } catch {
    return new Set();
  }
}

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
