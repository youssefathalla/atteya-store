import type {
  ProductGroupRow,
  ProductListCounts,
  ProductListView,
  ProductTableRow,
} from '../models/product-admin.model';
import { stockStatusFor } from './product-admin.utils';

export function matchesListView(row: ProductTableRow, view: ProductListView): boolean {
  switch (view) {
    case 'live':
      return row.published;
    case 'hidden':
      return !row.published;
    case 'low':
      return row.stockStatus === 'low';
    case 'out':
      return row.stockStatus === 'out';
    default:
      return true;
  }
}

export function countListViews(rows: readonly ProductTableRow[]): ProductListCounts {
  const counts = { all: rows.length, live: 0, hidden: 0, low: 0, out: 0 };
  for (const row of rows) {
    if (row.published) counts.live++;
    else counts.hidden++;
    if (row.stockStatus === 'low') counts.low++;
    if (row.stockStatus === 'out') counts.out++;
  }
  return counts;
}

/** One row per model group, in the order each model's first colour appears; products without a group stay alone. */
export function groupProductRows(rows: readonly ProductTableRow[]): ProductGroupRow[] {
  const buckets = new Map<string, ProductTableRow[]>();
  for (const row of rows) {
    const key = row.modelGroup ? `model:${row.modelGroup}` : row.id;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets].map(([key, colours]) => toGroupRow(key, colours));
}

function toGroupRow(id: string, colours: readonly ProductTableRow[]): ProductGroupRow {
  const first = colours[0]!;
  const prices = colours.map((row) => row.price);
  const counted = colours.flatMap((row) => (row.stock === null ? [] : [row.stock]));
  const stock = counted.length > 0 ? counted.reduce((sum, value) => sum + value, 0) : null;
  const samePrice = colours.every(
    (row) => row.price === first.price && row.compareAtPrice === first.compareAtPrice,
  );
  return {
    id,
    anchorId: first.id,
    name: first.name,
    categoryLabel: first.categoryLabel,
    details: detailsLine(first),
    imagePath: colours.find((row) => row.imagePath)?.imagePath ?? null,
    price: Math.min(...prices),
    priceMax: Math.max(...prices),
    compareAtPrice: samePrice ? first.compareAtPrice : null,
    stock,
    stockStatus: stockStatusFor(stock),
    liveCount: colours.filter((row) => row.published).length,
    colours,
  };
}

function detailsLine(row: ProductTableRow): string {
  const parts = [row.brandLabel];
  if (row.typeLabel && row.typeLabel !== row.categoryLabel) parts.push(row.typeLabel);
  return parts.filter(Boolean).join(' · ');
}
