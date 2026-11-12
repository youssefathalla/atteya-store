import type { CategorySizeChart, Product } from '@core/services/products';

export type SizeGuideId = 'men' | 'women';
export type SizeUnit = 'cm' | 'in';

type SizeValues = Readonly<Record<string, string>>;

export interface SizeGuideRow {
  readonly label: string;
  /** Value per size name; a size with no value shows a dash. */
  readonly cm: SizeValues;
  readonly in: SizeValues;
}

export interface SizeGuide {
  readonly id: SizeGuideId;
  /** Switch label when a product shows both charts. */
  readonly label: string;
  /** Columns, in size order, only those with at least one value. */
  readonly sizes: readonly string[];
  readonly rows: readonly SizeGuideRow[];
  /** True when shirt or weight rows were added to the body rows. */
  readonly hasExtraRows: boolean;
}

/** Column order. Same names as the size buttons on our products (2XL, not XXL). */
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;

function bySize(values: readonly string[], sizes: readonly string[] = SIZE_ORDER): SizeValues {
  return Object.fromEntries(sizes.map((size, index) => [size, values[index]]));
}

/** A row in centimetres and inches (inches given by the client). */
function lengthRow(label: string, cm: readonly string[], inches: readonly string[]): SizeGuideRow {
  const sizes = SIZE_ORDER.slice(0, 6);
  return { label, cm: bySize(cm, sizes), in: bySize(inches, sizes) };
}

/** Body measurements, copied as the client gave them (inches rounded by hand, not cm ÷ 2.54). */
const BODY_ROWS: Readonly<Record<SizeGuideId, readonly SizeGuideRow[]>> = {
  men: [
    lengthRow(
      'Chest',
      ['90', '91 – 96', '97 – 102', '103 – 108', '109 – 117', '118 – 126'],
      ['35.4', '35.8 – 37.8', '38.2 – 40.2', '40.6 – 42.5', '42.9 – 46.1', '46.5 – 49.6'],
    ),
    lengthRow(
      'Waist',
      ['75', '76 – 82', '83 – 89', '90 – 96', '97 – 105', '106 – 114'],
      ['29.5', '29.9 – 32.3', '32.7 – 35', '35.4 – 37.8', '38.2 – 41.3', '41.7 – 44.9'],
    ),
    lengthRow(
      'Hip',
      ['89', '90 – 95', '96 – 101', '102 – 107', '108 – 113', '114 – 119'],
      ['35', '35.4 – 37.4', '37.8 – 39.8', '40.2 – 42.1', '42.5 – 44.5', '44.9 – 46.9'],
    ),
  ],
  women: [
    lengthRow(
      'Waist',
      ['67', '68 – 73', '74 – 79', '80 – 85', '86 – 95', '96 – 105'],
      ['26.4', '26.8 – 28.7', '29.1 – 31.1', '31.5 – 33.5', '33.9 – 37.4', '37.8 – 41.3'],
    ),
    lengthRow(
      'Hip',
      ['90', '91 – 96', '97 – 102', '103 – 108', '109 – 115', '116 – 122'],
      ['35.4', '35.8 – 37.8', '38.2 – 40.2', '40.6 – 42.5', '42.9 – 45.3', '45.7 – 48'],
    ),
    lengthRow('Thigh', ['53', '55', '57', '59', '62', '65'], ['21', '21.5', '22.5', '23', '24.5', '25.5']),
  ],
};

const SHIRT_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const;

/** Weight is the same in both unit views; the label says kilograms. */
function weightRow(values: readonly string[], sizes: readonly string[]): SizeGuideRow {
  const kg = bySize(values, sizes);
  return { label: 'Weight (kg)', cm: kg, in: kg };
}

/** Extra rows for a kind of clothing: the weight row goes first in the table, the others last. */
interface ExtraRows {
  readonly weight: SizeGuideRow | null;
  readonly after: readonly SizeGuideRow[];
}

const NO_EXTRA: ExtraRows = { weight: null, after: [] };

/**
 * The client's t-shirt chart: size by body weight, and the shirt's own width and length
 * (cm; inches are cm ÷ 2.54 to one decimal).
 */
const SHIRT_EXTRA: ExtraRows = {
  weight: weightRow(['40 – 50', '50 – 70', '70 – 80', '80 – 90', '90 – 100', '100 – 115'], SHIRT_SIZES),
  after: [
    {
      label: 'Shirt Width',
      cm: bySize(['49', '52', '54', '56', '58', '60'], SHIRT_SIZES),
      in: bySize(['19.3', '20.5', '21.3', '22', '22.8', '23.6'], SHIRT_SIZES),
    },
    {
      label: 'Shirt Length',
      cm: bySize(['60', '70', '71', '72', '73', '74'], SHIRT_SIZES),
      in: bySize(['23.6', '27.6', '28', '28.3', '28.7', '29.1'], SHIRT_SIZES),
    },
  ],
};

/** The client's hoodie chart: size by body weight. */
const HOODIE_EXTRA: ExtraRows = {
  weight: weightRow(['50 – 70', '70 – 90', '90 – 110'], ['S', 'M', 'L']),
  after: [],
};

const LABELS: Readonly<Record<SizeGuideId, string>> = { men: 'Men', women: 'Women' };

function buildGuide(id: SizeGuideId, extra: ExtraRows): SizeGuide {
  const rows = [...(extra.weight ? [extra.weight] : []), ...BODY_ROWS[id], ...extra.after];
  const sizes = SIZE_ORDER.filter((size) => rows.some((row) => row.cm[size] !== undefined));
  return { id, label: LABELS[id], sizes, rows, hasExtraRows: rows.length > BODY_ROWS[id].length };
}

/**
 * Charts for the product page's Size & Fit section: a product with a size choice whose category
 * uses the clothing size chart (`categoryPageFor()`, set per category in Categories & Brands).
 * Women's or men's clothing gets its own chart; unisex or unset gets both, men's first.
 * T-shirts add a weight row first and shirt width and length rows last; hoodies add a weight row first.
 * A category with no size chart (socks, gear) gets none.
 */
export function sizeGuidesFor(
  product: Pick<Product, 'categoryIds' | 'options' | 'gender'>,
  sizeChart: CategorySizeChart,
): readonly SizeGuide[] {
  if (sizeChart !== 'clothing') return [];
  if (!product.options.some((option) => option.key === 'size')) return [];
  const extra = product.categoryIds.includes('t-shirts')
    ? SHIRT_EXTRA
    : product.categoryIds.includes('hoodies')
      ? HOODIE_EXTRA
      : NO_EXTRA;
  const ids: readonly SizeGuideId[] =
    product.gender === 'women' ? ['women'] : product.gender === 'men' ? ['men'] : ['men', 'women'];
  return ids.map((id) => buildGuide(id, extra));
}
