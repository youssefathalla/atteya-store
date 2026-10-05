export interface MegaMenuLink {
  readonly label: string;
  readonly path: string;
  readonly badge?: string;
  readonly isBrand?: boolean;
}

export interface MegaMenuColumn {
  readonly title?: string;
  readonly links: readonly MegaMenuLink[];
}

export interface NavCategory {
  readonly id: string;
  readonly label: string;
  readonly path?: string;
  readonly isHighlight?: boolean;
  readonly megaMenu?: readonly MegaMenuColumn[];
  readonly featuredCard?: {
    readonly title: string;
    readonly subtitle: string;
    readonly linkText: string;
    readonly path: string;
    readonly tag?: string;
  };
}
