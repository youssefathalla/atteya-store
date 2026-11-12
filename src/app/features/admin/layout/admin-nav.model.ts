export interface AdminNavSubItem {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly icon?: string;
  readonly badge?: string;
  readonly disabled?: boolean;
  readonly description?: string;
  /** Only admins see it (staff don't). */
  readonly adminOnly?: boolean;
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
