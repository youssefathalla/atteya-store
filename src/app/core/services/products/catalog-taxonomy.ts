/**
 * Shared catalogue taxonomy seed, colour palette, and tree helpers.
 * Keep in sync with functions/src/products/catalog-taxonomy.ts.
 */
import type { ProductTypeId } from './product.model';

export interface SeedCategory {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly ancestorIds: readonly string[];
  readonly path: string;
  readonly depth: 0 | 1;
  readonly sortOrder: number;
  readonly published: boolean;
}

export interface SeedBrand {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly published: boolean;
}

export const COLOR_IDS = [
  'white',
  'black',
  'grey',
  'navy',
  'blue',
  'light-blue',
  'red',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
  'beige',
  'brown',
  'gold',
  'silver',
  'multi',
] as const;

export type ColorId = (typeof COLOR_IDS)[number];

export interface ColorPaletteEntry {
  readonly id: ColorId;
  readonly label: string;
  readonly swatch: string;
}

export const COLOR_PALETTE: readonly ColorPaletteEntry[] = [
  { id: 'white', label: 'White', swatch: '#ffffff' },
  { id: 'black', label: 'Black', swatch: '#111111' },
  { id: 'grey', label: 'Grey', swatch: '#808080' },
  { id: 'navy', label: 'Navy', swatch: '#1b2a4a' },
  { id: 'blue', label: 'Blue', swatch: '#1e5bd8' },
  { id: 'light-blue', label: 'Light blue', swatch: '#7db8f5' },
  { id: 'red', label: 'Red', swatch: '#d62828' },
  { id: 'green', label: 'Green', swatch: '#2a8c4a' },
  { id: 'yellow', label: 'Yellow', swatch: '#f4c430' },
  { id: 'orange', label: 'Orange', swatch: '#f3722c' },
  { id: 'pink', label: 'Pink', swatch: '#e87ea1' },
  { id: 'purple', label: 'Purple', swatch: '#724cf9' },
  { id: 'beige', label: 'Beige', swatch: '#d8c3a5' },
  { id: 'brown', label: 'Brown', swatch: '#6f4e37' },
  { id: 'gold', label: 'Gold', swatch: '#d4af37' },
  { id: 'silver', label: 'Silver', swatch: '#c0c0c0' },
  { id: 'multi', label: 'Multi', swatch: '#555555' },
] as const;

const COLOR_RANK = new Map<ColorId, number>(
  COLOR_IDS.map((colorId, index) => [colorId, index]),
);

const COLOR_SYNONYMS: Readonly<Record<string, ColorId>> = {
  white: 'white',
  'off white': 'white',
  'off-white': 'white',
  ivory: 'white',
  cream: 'white',
  'أبيض': 'white',
  'ابيض': 'white',
  black: 'black',
  'أسود': 'black',
  'اسود': 'black',
  grey: 'grey',
  gray: 'grey',
  charcoal: 'grey',
  heather: 'grey',
  'رمادي': 'grey',
  navy: 'navy',
  'navy blue': 'navy',
  'dark blue': 'navy',
  midnight: 'navy',
  'كحلي': 'navy',
  'light blue': 'light-blue',
  'light-blue': 'light-blue',
  'sky blue': 'light-blue',
  'baby blue': 'light-blue',
  cyan: 'light-blue',
  aqua: 'light-blue',
  turquoise: 'light-blue',
  'لبني': 'light-blue',
  blue: 'blue',
  royal: 'blue',
  'royal blue': 'blue',
  cobalt: 'blue',
  'أزرق': 'blue',
  'ازرق': 'blue',
  red: 'red',
  crimson: 'red',
  burgundy: 'red',
  maroon: 'red',
  wine: 'red',
  'أحمر': 'red',
  'احمر': 'red',
  green: 'green',
  olive: 'green',
  khaki: 'green',
  lime: 'green',
  mint: 'green',
  emerald: 'green',
  'أخضر': 'green',
  'اخضر': 'green',
  yellow: 'yellow',
  lemon: 'yellow',
  'neon yellow': 'yellow',
  'أصفر': 'yellow',
  'اصفر': 'yellow',
  orange: 'orange',
  coral: 'orange',
  peach: 'orange',
  'برتقالي': 'orange',
  pink: 'pink',
  rose: 'pink',
  magenta: 'pink',
  fuchsia: 'pink',
  'وردي': 'pink',
  'بمبي': 'pink',
  purple: 'purple',
  violet: 'purple',
  lavender: 'purple',
  lilac: 'purple',
  'بنفسجي': 'purple',
  'موف': 'purple',
  beige: 'beige',
  sand: 'beige',
  tan: 'beige',
  nude: 'beige',
  stone: 'beige',
  'بيج': 'beige',
  brown: 'brown',
  chocolate: 'brown',
  camel: 'brown',
  coffee: 'brown',
  'بني': 'brown',
  gold: 'gold',
  golden: 'gold',
  'ذهبي': 'gold',
  silver: 'silver',
  metallic: 'silver',
  chrome: 'silver',
  'فضي': 'silver',
  multi: 'multi',
  multicolor: 'multi',
  multicolour: 'multi',
  mixed: 'multi',
};

const NAME_COLOR_PATTERNS: readonly { readonly id: ColorId; readonly pattern: RegExp }[] = [
  { id: 'light-blue', pattern: /\b(light[- ]blue|sky[- ]blue|baby[- ]blue|turquoise|aqua)\b/i },
  { id: 'navy', pattern: /\b(navy|dark[- ]blue|كحلي)\b/i },
  { id: 'white', pattern: /\b(off[- ]white|white|ivory|ابيض|أبيض)\b/i },
  { id: 'black', pattern: /\b(black|اسود|أسود)\b/i },
  { id: 'grey', pattern: /\b(grey|gray|charcoal|رمادي)\b/i },
  { id: 'blue', pattern: /\b(blue|royal|ازرق|أزرق)\b/i },
  { id: 'red', pattern: /\b(red|burgundy|crimson|maroon|احمر|أحمر)\b/i },
  { id: 'green', pattern: /\b(green|olive|lime|mint|emerald|اخضر|أخضر)\b/i },
  { id: 'yellow', pattern: /\b(yellow|اصفر|أصفر)\b/i },
  { id: 'orange', pattern: /\b(orange|coral|برتقالي)\b/i },
  { id: 'pink', pattern: /\b(pink|rose|magenta|وردي)\b/i },
  { id: 'purple', pattern: /\b(purple|violet|lavender|بنفسجي|موف)\b/i },
  { id: 'beige', pattern: /\b(beige|sand|tan|بيج)\b/i },
  { id: 'brown', pattern: /\b(brown|camel|بني)\b/i },
  { id: 'gold', pattern: /\b(gold|golden|ذهبي)\b/i },
  { id: 'silver', pattern: /\b(silver|فضي)\b/i },
  { id: 'multi', pattern: /\b(multicolou?r|multi[- ]colou?r)\b/i },
];

export function sortColors(colors: Iterable<ColorId>): ColorId[] {
  const unique = Array.from(new Set(colors));
  return unique
    .filter((id): id is ColorId => COLOR_RANK.has(id))
    .sort((left, right) => (COLOR_RANK.get(left) ?? 99) - (COLOR_RANK.get(right) ?? 99))
    .slice(0, 12);
}

export function colorIdFor(label: string, swatch?: string): ColorId | null {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (cleaned) {
    const direct = COLOR_SYNONYMS[cleaned];
    if (direct) return direct;

    for (const rule of NAME_COLOR_PATTERNS) {
      if (rule.pattern.test(cleaned)) {
        return rule.id;
      }
    }
  }

  if (swatch) {
    return nearestPaletteColor(swatch);
  }
  return null;
}

export function extractColorsFromName(name: string): ColorId[] {
  const normalized = name.replace(/\b(light|dark|sky|baby)[- ]blue\b/gi, (match) => {
    const lower = match.toLowerCase();
    return lower.startsWith('dark') ? 'navy' : 'light-blue';
  });

  const hits: ColorId[] = [];
  for (const rule of NAME_COLOR_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      hits.push(rule.id);
    }
  }
  return sortColors(hits);
}

function nearestPaletteColor(hex: string): ColorId | null {
  const rgb = parseHexRgb(hex);
  if (!rgb) return null;

  let bestId: ColorId = 'black';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of COLOR_PALETTE) {
    if (entry.id === 'multi') continue;
    const target = parseHexRgb(entry.swatch);
    if (!target) continue;
    const dr = rgb[0] - target[0];
    const dg = rgb[1] - target[1];
    const db = rgb[2] - target[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = entry.id;
    }
  }
  return bestId;
}

function parseHexRgb(hex: string): readonly [number, number, number] | null {
  const trimmed = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = Number.parseInt(trimmed[0] + trimmed[0], 16);
    const g = Number.parseInt(trimmed[1] + trimmed[1], 16);
    const b = Number.parseInt(trimmed[2] + trimmed[2], 16);
    return [r, g, b];
  }
  if (/^[0-9a-fA-F]{6,8}$/.test(trimmed)) {
    const r = Number.parseInt(trimmed.slice(0, 2), 16);
    const g = Number.parseInt(trimmed.slice(2, 4), 16);
    const b = Number.parseInt(trimmed.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    id: 'rackets',
    slug: 'rackets',
    name: 'Rackets',
    parentId: null,
    ancestorIds: [],
    path: 'rackets',
    depth: 0,
    sortOrder: 10,
    published: true,
  },
  {
    id: 'apparel',
    slug: 'apparel',
    name: 'Apparel',
    parentId: null,
    ancestorIds: [],
    path: 'apparel',
    depth: 0,
    sortOrder: 20,
    published: true,
  },
  {
    id: 't-shirts',
    slug: 't-shirts',
    name: 'T-shirts & polos',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/t-shirts',
    depth: 1,
    sortOrder: 10,
    published: true,
  },
  {
    id: 'shorts',
    slug: 'shorts',
    name: 'Shorts',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/shorts',
    depth: 1,
    sortOrder: 20,
    published: true,
  },
  {
    id: 'socks',
    slug: 'socks',
    name: 'Socks',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/socks',
    depth: 1,
    sortOrder: 30,
    published: true,
  },
  {
    id: 'sets',
    slug: 'sets',
    name: 'Sets',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/sets',
    depth: 1,
    sortOrder: 40,
    published: true,
  },
  {
    id: 'hoodies',
    slug: 'hoodies',
    name: 'Hoodies',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/hoodies',
    depth: 1,
    sortOrder: 50,
    published: false,
  },
  {
    id: 'tracksuits',
    slug: 'tracksuits',
    name: 'Tracksuits',
    parentId: 'apparel',
    ancestorIds: ['apparel'],
    path: 'apparel/tracksuits',
    depth: 1,
    sortOrder: 60,
    published: false,
  },
  {
    id: 'bags',
    slug: 'bags',
    name: 'Bags & gear',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/bags',
    depth: 1,
    sortOrder: 50,
    published: true,
  },
  {
    id: 'accessories',
    slug: 'accessories',
    name: 'Accessories',
    parentId: null,
    ancestorIds: [],
    path: 'accessories',
    depth: 0,
    sortOrder: 50,
    published: true,
  },
  {
    id: 'grips',
    slug: 'grips',
    name: 'Grips & protectors',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/grips',
    depth: 1,
    sortOrder: 10,
    published: true,
  },
  {
    id: 'balls',
    slug: 'balls',
    name: 'Balls',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/balls',
    depth: 1,
    sortOrder: 20,
    published: true,
  },
  {
    id: 'bottles',
    slug: 'bottles',
    name: 'Bottles',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/bottles',
    depth: 1,
    sortOrder: 30,
    published: true,
  },
  {
    id: 'supports',
    slug: 'supports',
    name: 'Supports & sleeves',
    parentId: 'accessories',
    ancestorIds: ['accessories'],
    path: 'accessories/supports',
    depth: 1,
    sortOrder: 40,
    published: true,
  },
  {
    id: 'bundles',
    slug: 'bundles',
    name: 'Bundles',
    parentId: null,
    ancestorIds: [],
    path: 'bundles',
    depth: 0,
    sortOrder: 60,
    published: false,
  },
] as const;

export const SEED_BRANDS: readonly SeedBrand[] = [
  { id: 'adidas', slug: 'adidas', name: 'adidas', sortOrder: 10, published: true },
  { id: 'bullpadel', slug: 'bullpadel', name: 'Bullpadel', sortOrder: 20, published: true },
  { id: 'siux', slug: 'siux', name: 'Siux', sortOrder: 30, published: true },
  { id: 'nox', slug: 'nox', name: 'NOX', sortOrder: 40, published: true },
  { id: 'babolat', slug: 'babolat', name: 'Babolat', sortOrder: 50, published: true },
  { id: 'on-cloud', slug: 'on-cloud', name: 'On', sortOrder: 60, published: true },
  { id: 'head', slug: 'head', name: 'HEAD', sortOrder: 70, published: true },
  { id: 'wilson', slug: 'wilson', name: 'Wilson', sortOrder: 80, published: true },
  { id: 'floky', slug: 'floky', name: 'Floky', sortOrder: 90, published: true },
  { id: 'asics', slug: 'asics', name: 'ASICS', sortOrder: 100, published: true },
  { id: 'cork', slug: 'cork', name: 'Cork', sortOrder: 110, published: true },
  { id: 'atteya', slug: 'atteya', name: 'Atteya', sortOrder: 120, published: true },
  { id: 'puma', slug: 'puma', name: 'PUMA', sortOrder: 130, published: false },
] as const;

export const DEFAULT_CATEGORY_FOR_TYPE: Readonly<Record<ProductTypeId, string>> = {
  rackets: 'rackets',
  bags: 'bags',
  't-shirts': 't-shirts',
  shorts: 'shorts',
  socks: 'socks',
  sets: 'sets',
  grips: 'grips',
  balls: 'balls',
  bottles: 'bottles',
  supports: 'supports',
};

const SEED_CATEGORY_BY_ID = new Map<string, SeedCategory>(
  SEED_CATEGORIES.map((category) => [category.id, category]),
);

/**
 * Returns the category branch (root first, leaf last) for a given leaf category id.
 * For example, 't-shirts' -> ['apparel', 't-shirts'], 'rackets' -> ['rackets'].
 */
export function categoryIdsFor(leafId: string): string[] {
  const category = SEED_CATEGORY_BY_ID.get(leafId);
  if (!category) return [leafId];
  return [...category.ancestorIds, category.id];
}
