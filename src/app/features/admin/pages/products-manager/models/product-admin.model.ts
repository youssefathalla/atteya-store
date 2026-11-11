import type { ColorId } from '@core/services/products/catalog-taxonomy';
import type { MarketingBadge } from '@core/services/products/marketing-badge';
import type { ProductGenderId, ProductTypeId } from '@core/services/products/product.model';
import type { ImageAsset } from '@shared/schemas';

export interface ProductTableRow {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly type: ProductTypeId;
  readonly typeLabel: string;
  readonly brandId: string;
  readonly brandLabel: string;
  readonly modelGroup: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly published: boolean;
  readonly imagePath: string | null;
  readonly status: 'live' | 'hidden';
  readonly stock: number | null;
  readonly stockStatus: 'in' | 'out' | 'unset';
}

export type StockChange =
  { readonly stockBySize: Readonly<Record<string, number>> } | { readonly stock: number };

export interface StockResult {
  readonly stock: number;
  readonly stockBySize: Readonly<Record<string, number>> | null;
  readonly inStock: boolean;
}

export interface ProductImagePayload {
  readonly path: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

/** Details shared by every colour of a product (`saveProductModel`). */
export interface ProductModelSharedPayload {
  readonly name: string;
  readonly summary: string | null;
  /** Left out = every saved colour keeps its own description. */
  readonly description?: string | null;
  readonly details: readonly string[];
  readonly type: ProductTypeId;
  readonly categoryId: string;
  readonly brandId: string;
  readonly gender: ProductGenderId | null;
  /** Player ids; left out while the player list hasn't loaded, so the saved lists stay. */
  readonly players?: readonly string[];
  readonly weightGrams: number | null;
  readonly tags: readonly string[];
  readonly marketingBadge: MarketingBadge | null;
  /** ISO timestamp or null when not flagged for New Arrivals. */
  readonly newArrivalUntil: string | null;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly sizes: readonly { readonly id?: string; readonly label: string }[];
}

export interface ProductModelColourPayload {
  readonly productId: string;
  /** Version from `getProductModel`; null = a new colour. */
  readonly version: string | null;
  readonly colors: readonly ColorId[];
  readonly images: readonly ProductImagePayload[];
  readonly published: boolean;
  readonly ownPrice: { readonly price: number; readonly compareAtPrice: number | null } | null;
  /** One count per shared size (same order); one number when there are no sizes. */
  readonly stock: readonly number[];
  /** One flag per shared size: false = this colour isn't made in it. */
  readonly made: readonly boolean[];
}

export interface SaveProductModelPayload {
  readonly anchorId: string | null;
  readonly shared: ProductModelSharedPayload;
  readonly colours: readonly ProductModelColourPayload[];
}

export interface ProductModelVersions {
  readonly modelGroup: string | null;
  readonly colours: readonly { readonly id: string; readonly version: string }[];
}

export interface SaveProductModelResult {
  readonly anchorId: string;
  readonly modelGroup: string | null;
  readonly colours: readonly { readonly id: string; readonly slug: string }[];
}

/** One size in the editor. `key` is the saved id, or a local key for a new size. */
export interface ModelSizeDraft {
  readonly key: string;
  readonly id?: string;
  readonly label: string;
}

/** One colour tab in the editor (one product document). */
export interface ColourDraft {
  readonly productId: string;
  readonly version: string | null;
  readonly slug: string | null;
  readonly colors: readonly ColorId[];
  readonly images: readonly ImageAsset[];
  readonly published: boolean;
  readonly ownPrice: boolean;
  readonly price: string;
  readonly compareAtPrice: string;
  /** Stock text per size key; '' = not set yet. */
  readonly stock: Readonly<Record<string, string>>;
  /** Size keys this colour isn't made in. */
  readonly notMade: readonly string[];
  /** Stock text when the product has no sizes. */
  readonly flatStock: string;
}

export interface CategoryOptionView {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly categoryIds: readonly string[];
}

export interface BrandOptionView {
  readonly id: string;
  readonly label: string;
}

export type MigratePass = 'add' | 'dropLegacy';

export interface MigrateSeedCountsView {
  readonly created: number;
  readonly repaired: number;
  readonly unchanged: number;
}

export interface MigrateProductCountsView {
  readonly updated: number;
  readonly unchanged: number;
  readonly missingNewFields: number;
  readonly colorsFromOptions: number;
  readonly colorsFromName: number;
  readonly colorsMissing: number;
  readonly colorsKept: number;
  readonly stockMissing: number;
}

export interface MigrateProductSampleView {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryIds: readonly string[];
  readonly brandId: string;
  readonly summary: string;
}

export interface MigrateReport {
  readonly dryRun: boolean;
  readonly pass: MigratePass;
  readonly categories: MigrateSeedCountsView;
  readonly brands: MigrateSeedCountsView;
  readonly products: MigrateProductCountsView;
  readonly sample: readonly MigrateProductSampleView[];
  readonly shippingSeeded?: boolean;
}

export interface ReindexSearchReport {
  readonly dryRun: boolean;
  readonly indexName: string;
  readonly indexed: number;
  readonly deleted: number;
}
