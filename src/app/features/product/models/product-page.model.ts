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
  | 'details'
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
  | 'gender'
  | 'players'
  | 'marketingBadge'
  | 'variants'
  | 'stock'
  | 'stockBySize'
  | 'inStock'
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

/** The choice a shopper still has to make after pressing Add to Bag. `attempt` re-triggers focus on every press. */
export interface ChoicePrompt {
  readonly key: string;
  readonly message: string;
  readonly attempt: number;
}

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    descriptionHtml: product.descriptionHtml,
    details: product.details,
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
    gender: product.gender,
    players: product.players,
    marketingBadge: product.marketingBadge,
    variants: product.variants,
    stock: product.stock,
    stockBySize: product.stockBySize,
    inStock: product.inStock,
  };
}
