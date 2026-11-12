import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import * as v from 'valibot';
import { injectFirestore } from '@core/firebase';
import { CATEGORY_DETAILS_TITLES, CATEGORY_SIZE_CHARTS } from './catalog-taxonomy';
import { CATEGORIES_COLLECTION } from './product.constants';
import type { CategoryPageSetting, CategoryPageSettings } from './utils/product-details';

/** A slow read must not hold the product page; the built-in settings stand in. */
const READ_TIMEOUT_MS = 3000;
/** A product has a leaf and at most one parent; this caps a bad `categoryIds` list. */
const MAX_IDS = 4;

const CategoryPageSettingSchema = v.object({
  sizeChart: v.optional(v.nullable(v.picklist(CATEGORY_SIZE_CHARTS))),
  detailsTitle: v.optional(v.nullable(v.picklist(CATEGORY_DETAILS_TITLES))),
});

/**
 * Reads the product page settings (size chart, details title; ATS-250) of a product's categories
 * for `productPageResolver`, which hands them to the browser through TransferState. A category that
 * can't be read (hidden, gone, offline, slow) is left out, so `categoryPageFor()` uses the built-in
 * default for it. In the browser each category is read once per tab (client navigations).
 */
@Service()
export class CategoryPageSettingsReader {
  readonly #firestore = injectFirestore();
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #cache = new Map<string, CategoryPageSetting>();

  /** Never rejects. */
  async read(categoryIds: readonly string[]): Promise<CategoryPageSettings> {
    const ids = [...new Set(categoryIds.filter((id) => id.length > 0))].slice(0, MAX_IDS);
    const entries = await Promise.all(ids.map(async (id) => [id, await this.#readOne(id)] as const));
    const out: Record<string, CategoryPageSetting> = {};
    for (const [id, setting] of entries) {
      if (setting) out[id] = setting;
    }
    return out;
  }

  async #readOne(id: string): Promise<CategoryPageSetting | null> {
    const cached = this.#cache.get(id);
    if (cached) return cached;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snap = await Promise.race([
        getDoc(doc(this.#firestore, CATEGORIES_COLLECTION, id)),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
        }),
      ]);
      if (!snap?.exists()) return null;
      const parsed = v.safeParse(CategoryPageSettingSchema, snap.data());
      if (!parsed.success) return null;
      // Only the fields that are there, so a missing one stays missing (built-in default) after JSON.
      const setting: CategoryPageSetting = {
        ...(parsed.output.sizeChart !== undefined ? { sizeChart: parsed.output.sizeChart } : {}),
        ...(parsed.output.detailsTitle !== undefined ? { detailsTitle: parsed.output.detailsTitle } : {}),
      };
      if (this.#isBrowser) this.#cache.set(id, setting);
      return setting;
    } catch {
      // Hidden categories are not readable by shoppers; the built-in default stands in.
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
