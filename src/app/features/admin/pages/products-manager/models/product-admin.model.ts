import type { BrandId, ProductTypeId } from '@core/services/products/product.model';

export interface ProductTableRow {
  readonly id: string;
  readonly name: string;
  readonly type: ProductTypeId;
  readonly typeLabel: string;
  readonly brand: BrandId;
  readonly brandLabel: string;
  readonly modelGroup: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly published: boolean;
  readonly imagePath: string | null;
  readonly status: 'live' | 'hidden';
}

export interface ProductEditDraft {
  readonly type: ProductTypeId;
  readonly brand: BrandId;
  readonly modelGroup: string | null;
  readonly published: boolean;
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
