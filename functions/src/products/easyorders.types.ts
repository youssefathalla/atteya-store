/**
 * Raw EasyOrders shapes. Fields are optional because the API omits empty keys.
 * `expense` is the cost price and is intentionally not listed, so it cannot be stored.
 */

export interface EasyOrdersListPage {
  readonly data?: readonly unknown[];
  readonly next_page?: number | null;
  readonly page?: number;
  readonly total?: number;
  readonly totalPages?: number;
}

export interface EasyOrdersVariationProp {
  readonly id?: string;
  readonly name?: string;
  readonly value?: string;
}

export interface EasyOrdersVariation {
  readonly id?: string;
  readonly name?: string;
  readonly type?: string;
  readonly props?: readonly EasyOrdersVariationProp[];
}

export interface EasyOrdersVariantProp {
  readonly variation?: string;
  readonly variation_prop?: string;
}

export interface EasyOrdersVariant {
  readonly id?: string;
  readonly quantity?: number;
  readonly variation_props?: readonly EasyOrdersVariantProp[];
}

export interface EasyOrdersCategoryRef {
  readonly id?: string;
}

export interface EasyOrdersProduct {
  readonly id?: string;
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string;
  readonly meta_description?: string;
  readonly price?: number;
  readonly sale_price?: number;
  readonly quantity?: number;
  readonly track_stock?: boolean;
  readonly hidden?: boolean;
  readonly thumb?: string;
  readonly images?: readonly unknown[];
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly parsed_categories?: readonly unknown[];
  readonly categories?: readonly EasyOrdersCategoryRef[];
  readonly variations?: readonly EasyOrdersVariation[];
  readonly variants?: readonly EasyOrdersVariant[];
}
