import type { Product } from '@core/services/products';

export type SizeGuideId = 'shirt' | 'shirt-weight' | 'hoodie-weight' | 'men' | 'women';
export type SizeUnit = 'cm' | 'in' | 'kg';

export interface SizeGuideRow {
  readonly label: string;
  /** One cell per size, in the same order as `sizes`, for every unit the chart offers. */
  readonly values: Readonly<Partial<Record<SizeUnit, readonly string[]>>>;
}

export interface SizeGuide {
  readonly id: SizeGuideId;
  /** Switch label when a product shows more than one chart. */
  readonly label: string;
  /** Start of the line above the table: "<intro> in centimetres." */
  readonly intro: string;
  /** Units the chart can show, first one by default. */
  readonly units: readonly SizeUnit[];
  readonly sizes: readonly string[];
  readonly rows: readonly SizeGuideRow[];
}

/** Switch label and the word used in "… in centimetres." */
export const SIZE_UNIT_NAMES: Readonly<Record<SizeUnit, { readonly label: string; readonly word: string }>> =
  {
    cm: { label: 'Centimetres', word: 'centimetres' },
    in: { label: 'Inches', word: 'inches' },
    kg: { label: 'Kilograms', word: 'kilograms' },
  };

const BODY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
/** Same names as the size buttons on our t-shirts. */
const SHIRT_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const;

/**
 * Every chart, copied as the client gave it. Body chart inches are the client's own (rounded by
 * hand); the shirt chart was given in centimetres only, so its inches are cm ÷ 2.54 to one decimal.
 */
export const SIZE_GUIDES: Readonly<Record<SizeGuideId, SizeGuide>> = {
  shirt: {
    id: 'shirt',
    label: 'Shirt Size',
    intro: 'Shirt measurements',
    units: ['cm', 'in'],
    sizes: SHIRT_SIZES,
    rows: [
      {
        label: 'Width',
        values: {
          cm: ['49', '52', '54', '56', '58', '60'],
          in: ['19.3', '20.5', '21.3', '22', '22.8', '23.6'],
        },
      },
      {
        label: 'Length',
        values: {
          cm: ['60', '70', '71', '72', '73', '74'],
          in: ['23.6', '27.6', '28', '28.3', '28.7', '29.1'],
        },
      },
    ],
  },
  'shirt-weight': {
    id: 'shirt-weight',
    label: 'By Weight',
    intro: 'Your weight',
    units: ['kg'],
    sizes: SHIRT_SIZES,
    rows: [
      {
        label: 'Weight',
        values: { kg: ['40 – 50', '50 – 70', '70 – 80', '80 – 90', '90 – 100', '100 – 115'] },
      },
    ],
  },
  'hoodie-weight': {
    id: 'hoodie-weight',
    label: 'By Weight',
    intro: 'Your weight',
    units: ['kg'],
    sizes: ['S', 'M', 'L'],
    rows: [{ label: 'Weight', values: { kg: ['50 – 70', '70 – 90', '90 – 110'] } }],
  },
  men: {
    id: 'men',
    label: "Men's Body",
    intro: 'Your body measurements',
    units: ['cm', 'in'],
    sizes: BODY_SIZES,
    rows: [
      {
        label: 'Chest',
        values: {
          cm: ['90', '91 – 96', '97 – 102', '103 – 108', '109 – 117', '118 – 126'],
          in: ['35.4', '35.8 – 37.8', '38.2 – 40.2', '40.6 – 42.5', '42.9 – 46.1', '46.5 – 49.6'],
        },
      },
      {
        label: 'Waist',
        values: {
          cm: ['75', '76 – 82', '83 – 89', '90 – 96', '97 – 105', '106 – 114'],
          in: ['29.5', '29.9 – 32.3', '32.7 – 35', '35.4 – 37.8', '38.2 – 41.3', '41.7 – 44.9'],
        },
      },
      {
        label: 'Hip',
        values: {
          cm: ['89', '90 – 95', '96 – 101', '102 – 107', '108 – 113', '114 – 119'],
          in: ['35', '35.4 – 37.4', '37.8 – 39.8', '40.2 – 42.1', '42.5 – 44.5', '44.9 – 46.9'],
        },
      },
    ],
  },
  women: {
    id: 'women',
    label: "Women's Body",
    intro: 'Your body measurements',
    units: ['cm', 'in'],
    sizes: BODY_SIZES,
    rows: [
      {
        label: 'Waist',
        values: {
          cm: ['67', '68 – 73', '74 – 79', '80 – 85', '86 – 95', '96 – 105'],
          in: ['26.4', '26.8 – 28.7', '29.1 – 31.1', '31.5 – 33.5', '33.9 – 37.4', '37.8 – 41.3'],
        },
      },
      {
        label: 'Hip',
        values: {
          cm: ['90', '91 – 96', '97 – 102', '103 – 108', '109 – 115', '116 – 122'],
          in: ['35.4', '35.8 – 37.8', '38.2 – 40.2', '40.6 – 42.5', '42.9 – 45.3', '45.7 – 48'],
        },
      },
      {
        label: 'Thigh',
        values: {
          cm: ['53', '55', '57', '59', '62', '65'],
          in: ['21', '21.5', '22.5', '23', '24.5', '25.5'],
        },
      },
    ],
  },
};

/** Clothing that has no letter sizes on these charts. */
const NO_GUIDE_CATEGORY_IDS: ReadonlySet<string> = new Set(['socks']);

/**
 * Charts for the product page's Size & Fit section: adult clothing with a size choice.
 * T-shirts get the shirt measurements and the size by weight first, hoodies the size by weight.
 * Then the body chart: women's or men's for that gender, both for unisex or unset.
 * Socks, kids' clothing and everything else get none.
 */
export function sizeGuidesFor(
  product: Pick<Product, 'categoryIds' | 'options' | 'gender'>,
): readonly SizeGuide[] {
  if (!product.categoryIds.includes('apparel')) return [];
  if (product.categoryIds.some((id) => NO_GUIDE_CATEGORY_IDS.has(id))) return [];
  if (!product.options.some((option) => option.key === 'size')) return [];
  if (product.gender === 'kids') return [];
  const own: SizeGuide[] = product.categoryIds.includes('t-shirts')
    ? [SIZE_GUIDES.shirt, SIZE_GUIDES['shirt-weight']]
    : product.categoryIds.includes('hoodies')
      ? [SIZE_GUIDES['hoodie-weight']]
      : [];
  switch (product.gender) {
    case 'women':
      return [...own, SIZE_GUIDES.women];
    case 'men':
      return [...own, SIZE_GUIDES.men];
    default:
      return [...own, SIZE_GUIDES.men, SIZE_GUIDES.women];
  }
}
