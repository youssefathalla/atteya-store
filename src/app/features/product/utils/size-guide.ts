import type { Product } from '@core/services/products';

export type SizeGuideId = 'men' | 'women';
export type SizeUnit = 'cm' | 'in';

export interface SizeGuideRow {
  readonly label: string;
  /** One cell per size, in the same order as `sizes`. */
  readonly cm: readonly string[];
  readonly in: readonly string[];
}

export interface SizeGuide {
  readonly id: SizeGuideId;
  /** Switch label when a product shows both charts. */
  readonly label: string;
  readonly sizes: readonly string[];
  readonly rows: readonly SizeGuideRow[];
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

/** Body measurements, copied as given (inches are rounded by hand, not always cm ÷ 2.54). */
export const SIZE_GUIDES: Readonly<Record<SizeGuideId, SizeGuide>> = {
  men: {
    id: 'men',
    label: 'Men',
    sizes: SIZES,
    rows: [
      {
        label: 'Chest',
        cm: ['90', '91 – 96', '97 – 102', '103 – 108', '109 – 117', '118 – 126'],
        in: ['35.4', '35.8 – 37.8', '38.2 – 40.2', '40.6 – 42.5', '42.9 – 46.1', '46.5 – 49.6'],
      },
      {
        label: 'Waist',
        cm: ['75', '76 – 82', '83 – 89', '90 – 96', '97 – 105', '106 – 114'],
        in: ['29.5', '29.9 – 32.3', '32.7 – 35', '35.4 – 37.8', '38.2 – 41.3', '41.7 – 44.9'],
      },
      {
        label: 'Hip',
        cm: ['89', '90 – 95', '96 – 101', '102 – 107', '108 – 113', '114 – 119'],
        in: ['35', '35.4 – 37.4', '37.8 – 39.8', '40.2 – 42.1', '42.5 – 44.5', '44.9 – 46.9'],
      },
    ],
  },
  women: {
    id: 'women',
    label: 'Women',
    sizes: SIZES,
    rows: [
      {
        label: 'Waist',
        cm: ['67', '68 – 73', '74 – 79', '80 – 85', '86 – 95', '96 – 105'],
        in: ['26.4', '26.8 – 28.7', '29.1 – 31.1', '31.5 – 33.5', '33.9 – 37.4', '37.8 – 41.3'],
      },
      {
        label: 'Hip',
        cm: ['90', '91 – 96', '97 – 102', '103 – 108', '109 – 115', '116 – 122'],
        in: ['35.4', '35.8 – 37.8', '38.2 – 40.2', '40.6 – 42.5', '42.9 – 45.3', '45.7 – 48'],
      },
      {
        label: 'Thigh',
        cm: ['53', '55', '57', '59', '62', '65'],
        in: ['21', '21.5', '22.5', '23', '24.5', '25.5'],
      },
    ],
  },
};

/** Clothing that has no letter sizes on these charts. */
const NO_GUIDE_CATEGORY_IDS: ReadonlySet<string> = new Set(['socks']);

/**
 * Charts for the product page's Size & Fit section: adult clothing with a size choice.
 * Women's or men's clothing gets its own chart; unisex or unset gets both, men's first.
 * Socks, kids' clothing and everything else get none.
 */
export function sizeGuidesFor(
  product: Pick<Product, 'categoryIds' | 'options' | 'gender'>,
): readonly SizeGuide[] {
  if (!product.categoryIds.includes('apparel')) return [];
  if (product.categoryIds.some((id) => NO_GUIDE_CATEGORY_IDS.has(id))) return [];
  if (!product.options.some((option) => option.key === 'size')) return [];
  switch (product.gender) {
    case 'women':
      return [SIZE_GUIDES.women];
    case 'men':
      return [SIZE_GUIDES.men];
    case 'kids':
      return [];
    default:
      return [SIZE_GUIDES.men, SIZE_GUIDES.women];
  }
}
