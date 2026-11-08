import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';

/**
 * One colour of a model (`modelGroup`) as the product card shows it under the photo.
 * Every product in a model carries the same list (`colorSiblings`), so listing grids and
 * Algolia records get the other colours without one extra read per card.
 * Keep the field names identical to `ColorSiblingSchema` in the Angular product schema.
 */
export interface ColorSibling {
  readonly id: string;
  readonly slug: string;
  readonly imagePath: string;
  readonly imageAlt: string;
  readonly inStock: boolean;
}

/** Colours kept per model; the card shows at most 8 of them. */
export const COLOR_SIBLINGS_MAX = 12;

/** Products read per model when the list is rebuilt (published and unpublished). */
const GROUP_READ_LIMIT = 50;

export function readModelGroup(data: DocumentData | null | undefined): string | null {
  const raw = data?.['modelGroup'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The list entry for one product, or null when it can't be shown (unpublished, no slug). */
export function colorSiblingFrom(
  id: string,
  data: DocumentData | null | undefined,
): ColorSibling | null {
  if (!data || data['published'] !== true) return null;
  const slug = readString(data['slug']);
  const name = readString(data['name']);
  if (!slug || !name) return null;
  const image = readPrimaryImage(data['images']);
  return {
    id,
    slug,
    imagePath: image?.path ?? '',
    imageAlt: image?.alt || name,
    inStock: readInStock(data),
  };
}

/**
 * The shared list for one model: published colours in document-id order (the same fixed order
 * as the product page's colour row), capped at `COLOR_SIBLINGS_MAX`.
 */
export function buildColorSiblings(
  docs: readonly { readonly id: string; readonly data: DocumentData }[],
): ColorSibling[] {
  return docs
    .map((doc) => colorSiblingFrom(doc.id, doc.data))
    .filter((entry): entry is ColorSibling => entry !== null)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .slice(0, COLOR_SIBLINGS_MAX);
}

export function sameColorSiblings(stored: unknown, next: readonly ColorSibling[]): boolean {
  if (!Array.isArray(stored) || stored.length !== next.length) return false;
  return next.every((entry, index) => {
    const other = stored[index] as Partial<ColorSibling> | null | undefined;
    return (
      typeof other === 'object' &&
      other !== null &&
      other.id === entry.id &&
      other.slug === entry.slug &&
      other.imagePath === entry.imagePath &&
      other.imageAlt === entry.imageAlt &&
      other.inStock === entry.inStock
    );
  });
}

/**
 * True when a product write can change what its model's colour list shows: the model changed,
 * or a field the list copies changed, or a product in a model has no list yet.
 * The trigger's own `colorSiblings` writes change none of these, so they never loop.
 */
export function colorSiblingsNeedRefresh(
  before: DocumentData | null | undefined,
  after: DocumentData | null | undefined,
): boolean {
  const beforeGroup = readModelGroup(before);
  const afterGroup = readModelGroup(after);
  if (beforeGroup !== afterGroup) return true;
  if (afterGroup === null) {
    // Left every model: only a leftover list needs clearing.
    return after !== null && after !== undefined && after['colorSiblings'] !== undefined;
  }
  if (!after) return true;
  if (!Array.isArray(after['colorSiblings'])) return true;
  const left = before ? colorSiblingFrom('', before) : null;
  const right = colorSiblingFrom('', after);
  return JSON.stringify(left) !== JSON.stringify(right);
}

/**
 * Rebuilds one model's list and writes it to every product in that model whose stored list
 * differs. Returns how many products were (or, in a dry run, would be) updated.
 */
export async function refreshColorSiblings(
  db: Firestore,
  modelGroup: string,
  options: { readonly dryRun?: boolean } = {},
): Promise<number> {
  const query = db
    .collection('products')
    .where('modelGroup', '==', modelGroup)
    .limit(GROUP_READ_LIMIT);

  if (options.dryRun) {
    const snap = await query.get();
    const list = buildColorSiblings(snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
    return snap.docs.filter((doc) => !sameColorSiblings(doc.get('colorSiblings'), list)).length;
  }

  // Read the group and write the list in one transaction, so two concurrent rebuilds of the
  // same model can't commit an older list over a newer one: if any product in the group
  // changes between the read and the commit, the transaction retries with fresh data.
  // The group is capped at GROUP_READ_LIMIT documents, well under the transaction write limit.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(query);
    const list = buildColorSiblings(snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
    const stale = snap.docs.filter((doc) => !sameColorSiblings(doc.get('colorSiblings'), list));
    for (const doc of stale) {
      tx.update(doc.ref, { colorSiblings: list });
    }
    return stale.length;
  });
}

/** Removes a leftover list from a product that no longer belongs to a model. */
export async function clearColorSiblings(db: Firestore, productId: string): Promise<void> {
  await db.collection('products').doc(productId).update({ colorSiblings: FieldValue.delete() });
}

function readString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function readPrimaryImage(raw: unknown): { path: string; alt: string } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (typeof first !== 'object' || first === null) return null;
  const path = readString((first as { path?: unknown }).path);
  if (!path) return null;
  return { path, alt: readString((first as { alt?: unknown }).alt) };
}

/** Same rule as search and checkout: `stock > 0` when counted, otherwise the stored flag. */
function readInStock(data: DocumentData): boolean {
  const stock = data['stock'];
  if (typeof stock === 'number' && Number.isFinite(stock)) return stock > 0;
  return data['inStock'] === true;
}
