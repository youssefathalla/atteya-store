export interface AdminNavSubItem {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly icon?: string;
  readonly badge?: string;
  readonly disabled?: boolean;
  readonly description?: string;
}

export interface AdminNavCategory {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly path?: string;
  readonly badge?: string;
  readonly disabled?: boolean;
  readonly subItems?: readonly AdminNavSubItem[];
}
