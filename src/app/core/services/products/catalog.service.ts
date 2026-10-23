import { computed, Service } from '@angular/core';
import { doc } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { signalDoc } from '@shared/utils/firebase/firestore-signals';
import { catalogPathIsEmpty } from './utils/catalog-path';
import { CATALOG_DOC, PRODUCT_BRANDS, PRODUCT_TYPES } from './product.constants';
import type { CatalogSummary } from './product.model';
import { CatalogSummarySchema } from './product.schema';

/**
 * Live published counts from settings/catalog.
 * A missing or incomplete document (including an import lock) means "unknown",
 * so the storefront keeps every navigation link.
 */
@Service()
export class CatalogService {
  readonly #firestore = injectFirestore();
  readonly #catalogDoc = signalDoc(doc(this.#firestore, CATALOG_DOC[0], CATALOG_DOC[1]));

  readonly summary = computed((): CatalogSummary | null => {
    const raw = this.#catalogDoc();
    if (!raw) return null;
    const parsed = v.safeParse(CatalogSummarySchema, raw);
    return parsed.success ? parsed.output : null;
  });

  readonly counts = this.summary;

  readonly visibleTypes = computed(() => {
    const summary = this.summary();
    if (!summary) return PRODUCT_TYPES;
    return PRODUCT_TYPES.filter((type) => (summary.types[type.id] ?? 0) > 0);
  });

  readonly visibleBrands = computed(() => {
    const summary = this.summary();
    if (!summary) return PRODUCT_BRANDS;
    return PRODUCT_BRANDS.filter((brand) => (summary.brands[brand.id] ?? 0) > 0);
  });

  isEmpty(path: string): boolean {
    const summary = this.summary();
    if (!summary) return false;
    return catalogPathIsEmpty(summary, path);
  }
}
