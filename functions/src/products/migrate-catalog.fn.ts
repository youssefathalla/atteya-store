import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { adminCallableOptions } from '../auth/callable-options.js';
import { requireRole } from '../auth/require-role.js';
import { recountCatalog } from './catalog-counts.js';
import type { ProductTypeId } from './catalog-mapping.js';
import {
  categoryIdsFor,
  DEFAULT_CATEGORY_FOR_TYPE,
  SEED_BRANDS,
  SEED_CATEGORIES,
} from './catalog-taxonomy.js';

export type MigratePass = 'add' | 'dropLegacy';

export interface MigrateSeedCounts {
  created: number;
  repaired: number;
  unchanged: number;
}

export interface MigrateProductCounts {
  updated: number;
  unchanged: number;
  missingNewFields: number;
}

export interface MigrateProductSample {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryIds: readonly string[];
  readonly brandId: string;
  readonly summary: string;
}

export interface MigrateCatalogResponse {
  readonly dryRun: boolean;
  readonly pass: MigratePass;
  readonly categories: MigrateSeedCounts;
  readonly brands: MigrateSeedCounts;
  readonly products: MigrateProductCounts;
  readonly sample: readonly MigrateProductSample[];
}

interface MigrateRequest {
  readonly dryRun: boolean;
  readonly pass: MigratePass;
}

const SAMPLE_LIMIT = 10;
const BATCH_LIMIT = 400;

export const migrateCatalogStructure = onCall(
  adminCallableOptions({ timeoutSeconds: 300, memory: '512MiB' }),
  async (request): Promise<MigrateCatalogResponse> => {
    const actor = await requireRole(request, 'admin');
    const input = parseMigrateRequest(request.data);
    const db = getFirestore();

    const response =
      input.pass === 'add'
        ? await runAddPass(db, input.dryRun)
        : await runDropLegacyPass(db, input.dryRun);

    if (!input.dryRun) {
      await db.collection('auditLogs').doc().set({
        action: 'catalog.migrate',
        pass: input.pass,
        actorUid: actor.uid,
        actorEmail: actor.email ?? actor.uid,
        at: FieldValue.serverTimestamp(),
        counts: {
          categories: response.categories,
          brands: response.brands,
          products: response.products,
        },
      });
    }

    return response;
  },
);

function parseMigrateRequest(raw: unknown): MigrateRequest {
  if (typeof raw !== 'object' || raw === null) {
    throw new HttpsError('invalid-argument', 'Invalid migration request.');
  }
  const data = raw as Record<string, unknown>;
  const dryRun = data['dryRun'] !== false;
  const pass = data['pass'];
  if (pass !== 'add' && pass !== 'dropLegacy') {
    throw new HttpsError('invalid-argument', 'Migration pass must be "add" or "dropLegacy".');
  }
  return { dryRun, pass };
}

async function runAddPass(db: Firestore, dryRun: boolean): Promise<MigrateCatalogResponse> {
  const categories = await seedCategories(db, dryRun);
  const brands = await seedBrands(db, dryRun);
  const { products, sample } = await backfillProducts(db, dryRun);

  if (!dryRun) {
    await recountCatalog(db);
  }

  return {
    dryRun,
    pass: 'add',
    categories,
    brands,
    products,
    sample,
  };
}

async function seedCategories(db: Firestore, dryRun: boolean): Promise<MigrateSeedCounts> {
  const counts: MigrateSeedCounts = { created: 0, repaired: 0, unchanged: 0 };
  const refs = SEED_CATEGORIES.map((seed) => db.doc(`categories/${seed.id}`));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let writes = 0;

  SEED_CATEGORIES.forEach((seed, index) => {
    const snap = snaps[index];
    const ref = refs[index];
    if (!snap?.exists) {
      counts.created += 1;
      if (!dryRun) {
        const now = FieldValue.serverTimestamp();
        batch.set(ref, {
          id: seed.id,
          slug: seed.slug,
          name: seed.name,
          parentId: seed.parentId,
          ancestorIds: [...seed.ancestorIds],
          path: seed.path,
          depth: seed.depth,
          sortOrder: seed.sortOrder,
          image: null,
          published: seed.published,
          productCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        writes += 1;
      }
      return;
    }

    const data = snap.data() ?? {};
    const repair: DocumentData = {};
    if (data['id'] !== seed.id) repair['id'] = seed.id;
    if (typeof data['slug'] !== 'string' || !data['slug']) repair['slug'] = seed.slug;
    if ((data['parentId'] ?? null) !== seed.parentId) repair['parentId'] = seed.parentId;
    if (!stringArraysEqual(data['ancestorIds'], seed.ancestorIds)) {
      repair['ancestorIds'] = [...seed.ancestorIds];
    }
    if (data['path'] !== seed.path) repair['path'] = seed.path;
    if (data['depth'] !== seed.depth) repair['depth'] = seed.depth;

    if (Object.keys(repair).length > 0) {
      counts.repaired += 1;
      if (!dryRun) {
        batch.set(ref, repair, { merge: true });
        writes += 1;
      }
    } else {
      counts.unchanged += 1;
    }
  });

  if (!dryRun && writes > 0) await batch.commit();
  return counts;
}

async function seedBrands(db: Firestore, dryRun: boolean): Promise<MigrateSeedCounts> {
  const counts: MigrateSeedCounts = { created: 0, repaired: 0, unchanged: 0 };
  const refs = SEED_BRANDS.map((seed) => db.doc(`brands/${seed.id}`));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let writes = 0;

  SEED_BRANDS.forEach((seed, index) => {
    const snap = snaps[index];
    const ref = refs[index];
    if (!snap?.exists) {
      counts.created += 1;
      if (!dryRun) {
        const now = FieldValue.serverTimestamp();
        batch.set(ref, {
          id: seed.id,
          slug: seed.slug,
          name: seed.name,
          logo: null,
          sortOrder: seed.sortOrder,
          published: seed.published,
          productCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        writes += 1;
      }
      return;
    }

    const data = snap.data() ?? {};
    const repair: DocumentData = {};
    if (data['id'] !== seed.id) repair['id'] = seed.id;
    if (typeof data['slug'] !== 'string' || !data['slug']) repair['slug'] = seed.slug;

    if (Object.keys(repair).length > 0) {
      counts.repaired += 1;
      if (!dryRun) {
        batch.set(ref, repair, { merge: true });
        writes += 1;
      }
    } else {
      counts.unchanged += 1;
    }
  });

  if (!dryRun && writes > 0) await batch.commit();
  return counts;
}

async function backfillProducts(
  db: Firestore,
  dryRun: boolean,
): Promise<{ products: MigrateProductCounts; sample: MigrateProductSample[] }> {
  const snap = await db.collection('products').limit(500).get();
  const counts: MigrateProductCounts = { updated: 0, unchanged: 0, missingNewFields: 0 };
  const sample: MigrateProductSample[] = [];
  const writes: { ref: DocumentReference; data: DocumentData }[] = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const name = typeof data['name'] === 'string' ? data['name'] : docSnap.id;
    const type = typeof data['type'] === 'string' ? (data['type'] as ProductTypeId) : undefined;
    const existingBrandId = nonEmptyString(data['brandId']);
    const legacyBrand = nonEmptyString(data['brand']);
    const brandId = existingBrandId ?? legacyBrand ?? '';

    const existingCategoryIds = nonEmptyStringArray(data['categoryIds']);
    const defaultLeaf = (type && DEFAULT_CATEGORY_FOR_TYPE[type]) || 'accessories';
    const categoryIds =
      existingCategoryIds.length > 0 ? existingCategoryIds : categoryIdsFor(defaultLeaf);
    const existingCategoryId = nonEmptyString(data['categoryId']);
    const categoryId =
      existingCategoryId && categoryIds.includes(existingCategoryId)
        ? existingCategoryId
        : (categoryIds[categoryIds.length - 1] ?? defaultLeaf);

    if (!brandId || categoryIds.length === 0 || !categoryId) {
      counts.missingNewFields += 1;
      continue;
    }

    const patch: DocumentData = {};
    const diffNotes: string[] = [];

    if (existingBrandId !== brandId) {
      patch['brandId'] = brandId;
      diffNotes.push(`brandId -> ${brandId}`);
    }
    if (!stringArraysEqual(existingCategoryIds, categoryIds)) {
      patch['categoryIds'] = categoryIds;
      diffNotes.push(`categoryIds -> [${categoryIds.join(', ')}]`);
    }
    if (existingCategoryId !== categoryId) {
      patch['categoryId'] = categoryId;
      diffNotes.push(`categoryId -> ${categoryId}`);
    }

    const rawLocked = Array.isArray(data['lockedFields']) ? data['lockedFields'] : [];
    const currentLocked = rawLocked.filter((item): item is string => typeof item === 'string');
    if (currentLocked.includes('brand')) {
      const nextLocked = [...new Set(currentLocked.map((item) => (item === 'brand' ? 'brandId' : item)))];
      patch['lockedFields'] = nextLocked;
      diffNotes.push('lockedFields brand -> brandId');
    }

    if (Object.keys(patch).length === 0) {
      counts.unchanged += 1;
      continue;
    }

    counts.updated += 1;
    writes.push({ ref: docSnap.ref, data: patch });
    if (sample.length < SAMPLE_LIMIT) {
      sample.push({
        id: docSnap.id,
        name,
        categoryId,
        categoryIds,
        brandId,
        summary: diffNotes.join('; '),
      });
    }
  }

  if (!dryRun && writes.length > 0) {
    await commitInBatches(db, writes, 'merge');
  }

  return { products: counts, sample };
}

async function runDropLegacyPass(db: Firestore, dryRun: boolean): Promise<MigrateCatalogResponse> {
  const snap = await db.collection('products').limit(500).get();
  let missingNewFields = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const hasCategoryId = Boolean(nonEmptyString(data['categoryId']));
    const hasCategoryIds = nonEmptyStringArray(data['categoryIds']).length > 0;
    const hasBrandId = Boolean(nonEmptyString(data['brandId']));
    if (!hasCategoryId || !hasCategoryIds || !hasBrandId) {
      missingNewFields += 1;
    }
  }

  if (missingNewFields > 0) {
    throw new HttpsError(
      'failed-precondition',
      `${missingNewFields} products are still missing categoryIds or brandId. Run "Check catalogue structure" and apply it before removing old fields.`,
    );
  }

  const counts: MigrateProductCounts = { updated: 0, unchanged: 0, missingNewFields: 0 };
  const sample: MigrateProductSample[] = [];
  const writes: { ref: DocumentReference; data: DocumentData }[] = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const hasLegacyCategory = 'category' in data;
    const hasLegacyBrand = 'brand' in data;
    if (!hasLegacyCategory && !hasLegacyBrand) {
      counts.unchanged += 1;
      continue;
    }

    const patch: DocumentData = {};
    const removed: string[] = [];
    if (hasLegacyCategory) {
      patch['category'] = FieldValue.delete();
      removed.push('category');
    }
    if (hasLegacyBrand) {
      patch['brand'] = FieldValue.delete();
      removed.push('brand');
    }

    counts.updated += 1;
    writes.push({ ref: docSnap.ref, data: patch });
    if (sample.length < SAMPLE_LIMIT) {
      sample.push({
        id: docSnap.id,
        name: typeof data['name'] === 'string' ? data['name'] : docSnap.id,
        categoryId: nonEmptyString(data['categoryId']) ?? '',
        categoryIds: nonEmptyStringArray(data['categoryIds']),
        brandId: nonEmptyString(data['brandId']) ?? '',
        summary: `Remove ${removed.join(', ')}`,
      });
    }
  }

  if (!dryRun && writes.length > 0) {
    await commitInBatches(db, writes, 'update');
  }

  return {
    dryRun,
    pass: 'dropLegacy',
    categories: { created: 0, repaired: 0, unchanged: 0 },
    brands: { created: 0, repaired: 0, unchanged: 0 },
    products: counts,
    sample,
  };
}

async function commitInBatches(
  db: Firestore,
  writes: readonly { ref: DocumentReference; data: DocumentData }[],
  mode: 'merge' | 'update',
): Promise<void> {
  for (let offset = 0; offset < writes.length; offset += BATCH_LIMIT) {
    const slice = writes.slice(offset, offset + BATCH_LIMIT);
    const batch = db.batch();
    for (const item of slice) {
      if (mode === 'merge') batch.set(item.ref, item.data, { merge: true });
      else batch.update(item.ref, item.data);
    }
    await batch.commit();
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function nonEmptyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function stringArraysEqual(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}
