/**
 * Storefront merchandising badge (distinct from freeform `tags` slugs).
 * Keep label/kind values in sync with functions/src/products/marketing-badge.ts.
 */

export const MARKETING_BADGE_KINDS = ['NEW', 'BESTSELLER', 'LIMITED_EDITION'] as const;
export type MarketingBadgeKind = (typeof MARKETING_BADGE_KINDS)[number];

export const MARKETING_BADGE_STYLES = ['plain', 'boxed'] as const;
export type MarketingBadgeStyle = (typeof MARKETING_BADGE_STYLES)[number];

export interface MarketingBadge {
  readonly kind: MarketingBadgeKind;
  readonly style: MarketingBadgeStyle;
}

export const MARKETING_BADGE_LABELS: Readonly<Record<MarketingBadgeKind, string>> = {
  NEW: 'NEW',
  BESTSELLER: 'BESTSELLER',
  LIMITED_EDITION: 'LIMITED EDITION',
};

export function marketingBadgeLabel(kind: MarketingBadgeKind): string {
  return MARKETING_BADGE_LABELS[kind];
}

export function isMarketingBadgeKind(value: string): value is MarketingBadgeKind {
  return (MARKETING_BADGE_KINDS as readonly string[]).includes(value);
}

export function isMarketingBadgeStyle(value: string): value is MarketingBadgeStyle {
  return (MARKETING_BADGE_STYLES as readonly string[]).includes(value);
}
