import { inject, Service } from '@angular/core';
import { toGiftChoice } from '@core/services/cart/cart-gifts';
import type { Offer, OfferBundleSlot, OfferConditions } from '@core/services/offers/engine';
import { canShopOffer } from '@core/services/offers/offer-shop';
import { type Product, PRODUCT_TYPE_IDS, type ProductTypeId, ProductService } from '@core/services/products';
import { SearchService } from '@core/services/search';
import { toProductView } from '../../product/models/product-page.model';
import type { BundleChoice } from '../../product/utils/product-bundle';
import { bundleSaveSlotChoices } from '../../product/utils/product-bundle-save';

/** Products listed per group (the product page's Bundle & Save section lists as many). */
export const MAX_GROUP_CHOICES = 20;
/** Search hits read for a whole offer Shop can list. */
const MAX_OFFER_HITS = 60;
/** Products read per category, brand, model or type a group names (offers Shop can't list). */
const MAX_PER_QUERY = 40;
/** List reads per offer (offers Shop can't list). */
const MAX_LIST_READS = 10;
/** Exact products read per offer (offers Shop can't list). */
const MAX_EXACT_PRODUCTS = 60;

/**
 * Reads the products each group of a Bundle & Save offer can take, in the browser (ATS-279).
 * An offer Shop can list uses Shop's search (`offerIds:"<id>" AND inStock:true`, every colour on
 * its own), like the product page's section; any other (signed-in only, once per customer) reads
 * Firestore by what its groups name: exact products, a model, a category, a brand or a type.
 * Each product is then read from Firestore, kept only while published and in stock
 * (`toGiftChoice()`), and split per group by the bag's own rules (`bundleSaveSlotChoices()`), with
 * only the sizes the bag would count there.
 */
@Service()
export class BundleProductsService {
  readonly #search = inject(SearchService);
  readonly #products = inject(ProductService);

  async choicesByGroup(offer: Offer, slots: readonly OfferBundleSlot[]): Promise<BundleChoice[][]> {
    const products = canShopOffer(offer) ? await this.#fromSearch(offer.id) : await this.#fromGroups(slots);
    const all = products.flatMap((product): BundleChoice[] => {
      const view = toGiftChoice(product);
      return view ? [{ view, product: toProductView(product) }] : [];
    });
    return slots.map((slot) => bundleSaveSlotChoices(all, offer, slot, MAX_GROUP_CHOICES));
  }

  async #fromSearch(offerId: string): Promise<Product[]> {
    const result = await this.#search.browseCatalog({
      filters: `offerIds:"${offerId}" AND inStock:true`,
      hitsPerPage: MAX_OFFER_HITS,
      distinct: false,
    });
    const ids = [...new Set(result.hits.map((hit) => hit.objectID))];
    return this.#byIds(ids);
  }

  async #fromGroups(slots: readonly OfferBundleSlot[]): Promise<Product[]> {
    const wanted = slots.map((slot) => groupReads(slot.conditions));
    const ids = [...new Set(wanted.flatMap((reads) => reads.productIds))].slice(0, MAX_EXACT_PRODUCTS);
    const lists = wanted.flatMap((reads) => reads.lists).slice(0, MAX_LIST_READS);
    const [exact, ...listed] = await Promise.all([
      this.#byIds(ids),
      ...lists.map((read) => this.#list(read)),
    ]);
    const byId = new Map<string, Product>();
    for (const product of [...exact!, ...listed.flat()]) byId.set(product.id, product);
    return [...byId.values()];
  }

  async #byIds(ids: readonly string[]): Promise<Product[]> {
    const products = await Promise.all(ids.map((id) => this.#products.getById(id)));
    return products.filter((product): product is Product => product !== null);
  }

  async #list(read: ListRead): Promise<readonly Product[]> {
    switch (read.field) {
      case 'categoryIds':
        return this.#products.listPublished({ categoryId: read.value, limit: MAX_PER_QUERY });
      case 'brandId':
        return this.#products.listPublished({ brandId: read.value, limit: MAX_PER_QUERY });
      case 'type':
        return this.#products.listPublished({ type: read.value as ProductTypeId, limit: MAX_PER_QUERY });
      case 'modelGroup':
        return this.#products.listModelGroup(read.value, MAX_PER_QUERY);
    }
  }
}

interface ListRead {
  readonly field: 'categoryIds' | 'brandId' | 'type' | 'modelGroup';
  readonly value: string;
}

/** Fields a list read can use, most specific first. */
const LIST_FIELDS: readonly ListRead['field'][] = ['modelGroup', 'categoryIds', 'brandId', 'type'];

/**
 * What to read for one group's rules: for each rule group, its exact products, or else the most
 * specific model, category, brand or type it names. The bag's rules then decide what fits.
 */
function groupReads(conditions: OfferConditions): { productIds: string[]; lists: ListRead[] } {
  const productIds: string[] = [];
  const lists: ListRead[] = [];
  for (const group of conditions.anyOf) {
    const byField = new Map<string, readonly string[]>();
    for (const atom of group.allOf) {
      if (atom.field !== 'price' && atom.in && atom.in.length > 0) byField.set(atom.field, atom.in);
    }
    const exact = byField.get('productId');
    if (exact) {
      productIds.push(...exact);
      continue;
    }
    const field = LIST_FIELDS.find((name) => byField.has(name));
    if (!field) continue;
    for (const value of byField.get(field)!) {
      if (field === 'type' && !(PRODUCT_TYPE_IDS as readonly string[]).includes(value)) continue;
      lists.push({ field, value });
    }
  }
  return { productIds, lists };
}
