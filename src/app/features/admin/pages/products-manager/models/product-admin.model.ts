import type { ColorId } from '@core/services/products/catalog-taxonomy';
import type { ProductTypeId } from '@core/services/products/product.model';

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
  | { readonly stockBySize: Readonly<Record<string, number>> }
  | { readonly stock: number };

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

export interface ProductSizePayload {
  readonly id?: string;
  readonly label: string;
  readonly initialStock?: number;
}

export interface ProductFormPayload {
  readonly name: string;
  readonly summary: string | null;
  readonly description?: string | null;
  readonly type: ProductTypeId;
  readonly categoryId: string;
  readonly brandId: string;
  readonly modelGroup: string | null;
  readonly colors: readonly ColorId[];
  readonly tags: readonly string[];
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly published: boolean;
  readonly images: readonly ProductImagePayload[];
  readonly sizes: readonly ProductSizePayload[];
  readonly stock?: number;
}

export interface CreateProductPayload extends ProductFormPayload {
  readonly productId: string;
  readonly slug?: string;
}

export interface UpdateProductPayload extends ProductFormPayload {
  readonly productId: string;
}

export interface SaveProductResult {
  readonly id: string;
  readonly slug: string;
}

export interface ProductSizeDraft {
  readonly id?: string;
  readonly label: string;
  readonly initialStock: string;
  readonly isNew: boolean;
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

export interface ImportCountsView {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skippedLocked: number;
  readonly imagesCopied: number;
  readonly imagesSkipped: number;
  readonly unpublishedMissing: number;
}

export interface ImportRowView {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly brand: string;
  readonly modelGroup: string | null;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly images: number;
  readonly options: readonly string[];
  readonly action: 'create' | 'update' | 'unchanged';
  readonly warnings: readonly string[];
}

export interface ImportReport {
  readonly dryRun: boolean;
  readonly total: number;
  readonly counts: ImportCountsView;
  readonly rows: readonly ImportRowView[];
  readonly errors: readonly string[];
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
  readonly stockNeedsImport: number;
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
