import { TemplateRef } from '@angular/core';

export interface TableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  hasMenu?: boolean;
  customCellTpl?: TemplateRef<unknown>;
  exportable?: boolean;
  excelFormatter?: (value: string, row: T) => string;
  serverFilter?: boolean;
  filterOptions?: FilterOptions[];
}

export interface FilterOptions {
  value: unknown;
  label: string;
}

export interface FilterState {
  columns: Partial<Record<string, unknown>>;
}

export interface ExcelColumnConfig<T> {
  key: keyof T;
  label: string;
  formatter?: (value: string, row: T) => string;
}

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PaginationServiceInterface<T> {
  readonly state: () => { limit: number; [key: string]: unknown };
  readonly items: () => T[];

  readonly currentPage: () => number;
  readonly totalPages: () => number;
  readonly hasNextPage: () => boolean;
  readonly hasPreviousPage: () => boolean;
  readonly isLoading: () => boolean;
  readonly error: () => string | null;
  readonly total: () => number;
  readonly sort?: () => SortSpec;

  setQuery(where: unknown[], orderBy: SortSpec[]): Promise<void>;
  setFilter(where: unknown[]): Promise<void>;
  loadPage(direction: 'next' | 'prev' | 'first' | 'last'): Promise<void>;
  setPageSize(limit: number): Promise<void>;
  refresh(): Promise<void>;
  reset(): Promise<void>;
}
