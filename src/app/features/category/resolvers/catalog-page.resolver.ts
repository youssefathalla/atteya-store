import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, RESPONSE_INIT } from '@angular/core';
import { RedirectCommand, Router, type ResolveFn } from '@angular/router';
import { collection, type Firestore, getDocs, limit, query, where } from 'firebase/firestore';
import { injectFirestore } from '@core/firebase';
import { BRANDS_COLLECTION, CatalogService, ShopCategoriesService } from '@core/services/products';
import { markNotFound } from '@shared/utils/error-response';
import {
  type CatalogPageDecision,
  decideBrandPage,
  decideCategoryPage,
  type PublishedBrandRef,
} from '../utils/catalog-page-state';

/** `ok`: show the page. `missing`: show Page Not Found (the server answers 404). */
export type CatalogPageState = 'ok' | 'missing';

/** A slow brand read must not hold the page; nothing is decided then. */
const READ_TIMEOUT_MS = 3000;

/**
 * Category and brand addresses never open an empty page (ATS-268): an empty or hidden sub-category
 * goes to its main category, an empty or hidden main category or brand goes to Shop (a real 302 on the
 * server, so it comes back once products are live; `replaceUrl` in the browser), and a deleted or
 * unknown one shows Page Not Found with 404. Runs after the store layout's resolvers, so the
 * `settings/catalog` counts and the published categories are already read for this request.
 */
export const catalogPageResolver: ResolveFn<CatalogPageState | RedirectCommand> = async (route) => {
  const router = inject(Router);
  const catalog = inject(CatalogService);
  const responseInit = inject(RESPONSE_INIT, { optional: true });
  const shopCategories = inject(ShopCategoriesService);
  const firestore = injectFirestore();
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const data = route.data;
  const slug =
    route.paramMap.get('slug') ?? (typeof data['shopCategory'] === 'string' ? data['shopCategory'] : '');
  const counts = catalog.summary();
  const deletedBuiltInIds = catalog.deletedBuiltInIds();

  let decision: CatalogPageDecision;
  if (data['isBrand'] === true) {
    decision = decideBrandPage({
      slug,
      published: await publishedBrands(slug, isBrowser ? catalog.brands() : undefined, firestore),
      counts,
      deletedBuiltInIds,
    });
  } else {
    const sub =
      route.paramMap.get('subSlug') ??
      (typeof data['shopSubcategory'] === 'string' ? data['shopSubcategory'] : null);
    decision = decideCategoryPage({
      slug,
      subSlug: sub,
      published: await shopCategories.load(),
      counts,
      deletedBuiltInIds,
    });
  }

  if (decision.kind === 'missing') {
    markNotFound(responseInit);
    return 'missing';
  }
  if (decision.kind === 'redirect') {
    if (responseInit) {
      // 302, not 301: the category comes back by itself once it has live products again.
      responseInit.status = 302;
      const headers = new Headers(responseInit.headers);
      headers.set('Cache-Control', 'private, no-store');
      responseInit.headers = headers;
    }
    return new RedirectCommand(router.parseUrl(decision.path), { replaceUrl: true });
  }
  return 'ok';
};

/** The shown brand with this address (the live list in the browser, else one small read); null when unknown. */
async function publishedBrands(
  slug: string,
  live: readonly PublishedBrandRef[] | undefined,
  firestore: Firestore,
): Promise<readonly PublishedBrandRef[] | null> {
  if (live && live.length > 0) return live;
  const target = slug.trim().toLowerCase();
  if (!target) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snap = await Promise.race([
      getDocs(
        query(
          collection(firestore, BRANDS_COLLECTION),
          where('published', '==', true),
          where('slug', '==', target),
          limit(1),
        ),
      ),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
      }),
    ]);
    if (!snap) return null;
    return snap.docs.map((doc) => ({ id: doc.id, slug: String(doc.get('slug') ?? doc.id) }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
