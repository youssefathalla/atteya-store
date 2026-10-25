import type { Product } from '@core/services/products';
import type { TransferOffer } from '@core/services/offers/offer-transfer';

/** JSON-safe subset sent from server to browser (no Firestore Timestamps). */
export type ProductView = Pick<
  Product,
  | 'id'
  | 'slug'
  | 'name'
  | 'summary'
  | 'descriptionHtml'
  | 'detailImages'
  | 'categoryId'
  | 'categoryIds'
  | 'type'
  | 'brandId'
  | 'modelGroup'
  | 'currency'
  | 'price'
  | 'compareAtPrice'
  | 'images'
  | 'options'
  | 'colors'
  | 'tags'
  | 'trackStock'
  | 'variants'
>;

export type ProductPageResult =
  | {
      readonly status: 'found';
      readonly product: ProductView;
      /** Active public offers that can match this product; null = the offers read failed. */
      readonly offers: readonly TransferOffer[] | null;
      /** Clock used for the first render (server render time, or client time on client navigation). */
      readonly renderedAtMs: number;
    }
  | { readonly status: 'missing' }
  | { readonly status: 'error' };

/** option key -> selected value id */
export type OptionSelection = Readonly<Record<string, string>>;

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    descriptionHtml: product.descriptionHtml,
    detailImages: product.detailImages,
    categoryId: product.categoryId,
    categoryIds: product.categoryIds,
    type: product.type,
    brandId: product.brandId,
    modelGroup: product.modelGroup,
    currency: product.currency,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    images: product.images,
    options: product.options,
    colors: product.colors,
    tags: product.tags,
    trackStock: product.trackStock,
    variants: product.variants,
  };
}
