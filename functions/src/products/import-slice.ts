import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import type { ColorId } from './catalog-taxonomy.js';
import { EasyOrdersError, fetchEasyOrdersProduct } from './easyorders.client.js';
import type { ImportRow } from './import-request.js';
import { copyProductImage, imageWarning, storedImage, type StoredImage } from './product-images.js';
import {
  createdAtStamp,
  emptyCounts,
  hashCatalogueSlice,
  LOCKABLE_FIELDS,
  productSource,
  type ImportCounts,
  type LockableField,
  type StoredOption,
  type StoredOptionValue,
} from './product-document.js';
import { mapEasyOrdersProduct, type MappedImageRef, type MappedProduct } from './product-mapper.js';
import { buildSearchTokens } from './search-tokens.js';
import { mapPool } from './promise-pool.js';
import { nextSlug } from './slug.js';

const POOL_SIZE = 3;

interface ExistingProduct {
  readonly exists: boolean;
  readonly slug?: string;
  readonly hash?: string;
  readonly type?: string;
  readonly brandId?: string;
  readonly categoryIds?: readonly string[];
  readonly colors?: readonly string[];
  readonly hasTags: boolean;
  readonly modelGroup: string | null;
  readonly published?: boolean;
  readonly wasMissing: boolean;
  readonly locked: readonly LockableField[];
}

interface SliceResult {
  readonly counts: ImportCounts;
  readonly rows: ImportRow[];
  readonly errors: string[];
}

interface PlannedWrite {
  readonly ref: DocumentReference;
  readonly kind: 'create' | 'update' | 'touch';
  readonly data: DocumentData;
}

export async function importSlice(
  db: Firestore,
  input: { readonly dryRun: boolean; readonly runId: string; readonly ids: readonly string[] },
): Promise<SliceResult> {
  const slugs = new SlugBook(db);
  const outcomes = await mapPool(input.ids, POOL_SIZE, (id) =>
    importOne(db, slugs, input.dryRun, input.runId, id),
  );

  const counts = emptyCounts();
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const writes: PlannedWrite[] = [];

  for (const outcome of outcomes) {
    if (outcome.error) errors.push(outcome.error);
    if (!outcome.row || !outcome.counts) continue;
    rows.push(outcome.row);
    counts.created += outcome.counts.created;
    counts.updated += outcome.counts.updated;
    counts.unchanged += outcome.counts.unchanged;
    counts.skippedLocked += outcome.counts.skippedLocked;
    counts.imagesCopied += outcome.counts.imagesCopied;
    counts.imagesSkipped += outcome.counts.imagesSkipped;
    if (outcome.write) writes.push(outcome.write);
  }

  if (!input.dryRun && writes.length > 0) {
    const batch = db.batch();
    for (const write of writes) {
      if (write.kind === 'create') batch.set(write.ref, write.data);
      else if (write.kind === 'update') batch.set(write.ref, write.data, { merge: true });
      else batch.update(write.ref, write.data);
    }
    await batch.commit();
  }

  return { counts, rows, errors };
}

interface OneOutcome {
  readonly error?: string;
  readonly row?: ImportRow;
  readonly counts?: ImportCounts;
  readonly write?: PlannedWrite;
}

async function importOne(
  db: Firestore,
  slugs: SlugBook,
  dryRun: boolean,
  runId: string,
  id: string,
): Promise<OneOutcome> {
  try {
    const raw = await fetchEasyOrdersProduct(id);
    const mapped = mapEasyOrdersProduct(raw);
    if (!mapped.ok) return { error: mapped.failure.message };

    const product = mapped.product;
    const existing = await readExisting(db, product.docId);
    const stored = await materialise(product, dryRun);
    const hash = hashCatalogueSlice({
      product,
      detailImages: stored.detailImages,
      images: stored.images,
      options: stored.options,
    });
    const action = !existing.exists ? 'create' : existing.hash === hash ? 'unchanged' : 'update';
    const skippedLocked = lockedDrift(existing, product) ? 1 : 0;
    const warnings = [...product.warnings, ...stored.warnings];
    if (skippedLocked === 1) warnings.push('Edits made here were kept.');

    const counts = emptyCounts();
    if (action === 'create') counts.created = 1;
    else if (action === 'update') counts.updated = 1;
    else counts.unchanged = 1;
    counts.skippedLocked = skippedLocked;
    counts.imagesCopied = stored.copied;
    counts.imagesSkipped = stored.skipped;

    let write: PlannedWrite | undefined;
    if (!dryRun) {
      const slug = action === 'create' ? await slugs.claim(product.slugBase) : (existing.slug ?? product.slugBase);
      write = plannedWrite(db, product, stored, hash, runId, existing, slug, action);
    }

    return {
      row: {
        id: product.docId,
        name: product.name,
        type: product.type,
        brand: product.brandId,
        modelGroup: product.modelGroup,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        images: stored.images.length,
        options: stored.options.map((option) => option.label),
        action,
        warnings,
      },
      counts,
      write,
    };
  } catch (error) {
    const message = error instanceof EasyOrdersError ? error.message : 'That product could not be read.';
    return { error: `${id}: ${message}` };
  }
}

async function readExisting(db: Firestore, docId: string): Promise<ExistingProduct> {
  const snap = await db.doc(`products/${docId}`).get();
  if (!snap.exists) {
    return { exists: false, hasTags: false, modelGroup: null, wasMissing: false, locked: [] };
  }
  const data = snap.data() ?? {};
  const source = isRecord(data['source']) ? data['source'] : {};
  const rawLocked = Array.isArray(data['lockedFields']) ? data['lockedFields'] : [];
  const normalizedLocked = rawLocked
    .map((item) => (item === 'brand' ? 'brandId' : item))
    .filter((field): field is LockableField => LOCKABLE_FIELDS.includes(field as LockableField));
  const missingSince = source['missingSince'];
  const brandId =
    typeof data['brandId'] === 'string'
      ? data['brandId']
      : typeof data['brand'] === 'string'
        ? data['brand']
        : undefined;
  const categoryIds = Array.isArray(data['categoryIds'])
    ? data['categoryIds'].filter((item): item is string => typeof item === 'string')
    : undefined;
  const colors = Array.isArray(data['colors'])
    ? data['colors'].filter((item): item is string => typeof item === 'string')
    : undefined;
  const hasTags = Array.isArray(data['tags']);

  return {
    exists: true,
    slug: typeof data['slug'] === 'string' ? data['slug'] : undefined,
    hash: typeof source['hash'] === 'string' ? source['hash'] : undefined,
    type: typeof data['type'] === 'string' ? data['type'] : undefined,
    brandId,
    categoryIds,
    colors,
    hasTags,
    modelGroup: typeof data['modelGroup'] === 'string' ? data['modelGroup'] : null,
    published: typeof data['published'] === 'boolean' ? data['published'] : undefined,
    wasMissing: missingSince !== null && missingSince !== undefined,
    locked: normalizedLocked,
  };
}

function lockedDrift(existing: ExistingProduct, product: MappedProduct): boolean {
  if (!existing.exists) return false;
  if (existing.locked.includes('type') && existing.type !== product.type) return true;
  if (existing.locked.includes('brandId') && existing.brandId !== product.brandId) return true;
  if (
    existing.locked.includes('categoryIds') &&
    !sameStrings(existing.categoryIds ?? [], product.categoryIds)
  ) {
    return true;
  }
  if (existing.locked.includes('modelGroup') && existing.modelGroup !== product.modelGroup) return true;
  if (
    existing.locked.includes('colors') &&
    !sameStrings(existing.colors ?? [], product.colors)
  ) {
    return true;
  }
  if (existing.locked.includes('published') && existing.published !== product.published) return true;
  return false;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

interface Materialised {
  readonly detailImages: readonly StoredImage[];
  readonly images: readonly StoredImage[];
  readonly options: readonly StoredOption[];
  readonly copied: number;
  readonly skipped: number;
  readonly warnings: readonly string[];
}

async function materialise(product: MappedProduct, dryRun: boolean): Promise<Materialised> {
  const warnings: string[] = [];
  let copied = 0;
  let skipped = product.skippedImageCount;

  const keep = async (image: MappedImageRef): Promise<StoredImage | null> => {
    if (dryRun) return storedImage(product.docId, image);
    try {
      const result = await copyProductImage(product.docId, image);
      if (result.copied) copied += 1;
      else skipped += 1;
      return result.image;
    } catch (error) {
      skipped += 1;
      warnings.push(imageWarning(error));
      return null;
    }
  };

  const detailImages: StoredImage[] = [];
  for (const image of product.detailImages) {
    const stored = await keep(image);
    if (stored) detailImages.push(stored);
  }

  const images: StoredImage[] = [];
  for (const image of product.gallery) {
    const stored = await keep(image);
    if (stored) images.push(stored);
  }

  const options: StoredOption[] = [];
  for (const option of product.options) {
    const values: StoredOptionValue[] = [];
    for (const value of option.values) {
      const storedValue: {
        id: string;
        label: string;
        swatch?: string;
        color?: ColorId;
        image?: StoredImage;
      } = {
        id: value.id,
        label: value.label,
      };
      if (value.swatch) storedValue.swatch = value.swatch;
      if (value.color) storedValue.color = value.color;
      if (value.image) {
        const stored = await keep(value.image);
        if (stored) storedValue.image = stored;
      }
      values.push(storedValue);
    }
    options.push({ key: option.key, label: option.label, values });
  }

  return { detailImages, images, options, copied, skipped, warnings };
}

function plannedWrite(
  db: Firestore,
  product: MappedProduct,
  stored: Materialised,
  hash: string,
  runId: string,
  existing: ExistingProduct,
  slug: string,
  action: 'create' | 'update' | 'unchanged',
): PlannedWrite {
  const ref = db.doc(`products/${product.docId}`);
  if (action === 'unchanged') {
    const data: DocumentData = {
      'source.lastRunId': runId,
      'source.missingSince': null,
    };
    if (existing.wasMissing && !existing.locked.includes('published')) {
      data['published'] = product.published;
    }
    return { ref, kind: 'touch', data };
  }

  const source = productSource(product, hash, runId);
  const data: DocumentData = {
    name: product.name,
    summary: product.summary,
    descriptionHtml: product.descriptionHtml,
    detailImages: stored.detailImages,
    currency: product.currency,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    images: stored.images,
    options: stored.options,
    trackStock: product.trackStock,
    variants: product.variants,
    source,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (action === 'create' || !existing.locked.includes('type')) {
    data['type'] = product.type;
  }
  if (action === 'create' || !existing.locked.includes('categoryIds')) {
    data['categoryId'] = product.categoryId;
    data['categoryIds'] = product.categoryIds;
  }
  if (action === 'create' || !existing.locked.includes('brandId')) {
    data['brandId'] = product.brandId;
  }
  if (action === 'create' || !existing.locked.includes('modelGroup')) {
    data['modelGroup'] = product.modelGroup;
  }
  if (action === 'create' || !existing.locked.includes('published')) {
    data['published'] = product.published;
  }
  if (action === 'create' || !existing.locked.includes('colors')) {
    data['colors'] = product.colors;
  }
  if (action === 'create' || !existing.hasTags) {
    data['tags'] = [];
  }

  const storedModelGroup =
    action === 'create' || !existing.locked.includes('modelGroup')
      ? product.modelGroup
      : existing.modelGroup;
  data['searchTokens'] = buildSearchTokens(product.name, storedModelGroup);

  if (action === 'create') {
    data['id'] = product.docId;
    data['slug'] = slug;
    data['lockedFields'] = [];
    data['createdAt'] = createdAtStamp(product.createdAtIso);
    return { ref, kind: 'create', data };
  }
  return { ref, kind: 'update', data };
}

class SlugBook {
  #chain: Promise<void> = Promise.resolve();
  readonly #reserved = new Set<string>();

  constructor(private readonly db: Firestore) {}

  claim(base: string): Promise<string> {
    const run = this.#chain.then(() => this.#claim(base));
    this.#chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #claim(base: string): Promise<string> {
    let candidate = nextSlug(base, this.#reserved);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const snap = await this.db.collection('products').where('slug', '==', candidate).limit(1).get();
      if (snap.empty) {
        this.#reserved.add(candidate);
        return candidate;
      }
      this.#reserved.add(candidate);
      candidate = nextSlug(base, this.#reserved);
    }
    const fallback = `${base}-${Date.now().toString(36)}`;
    this.#reserved.add(fallback);
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
