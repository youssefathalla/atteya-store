/**
 * Move the `bags` category under `accessories` and fix product `categoryIds`.
 *
 * Dev (default):
 *   cd functions && npm run build
 *   node scripts/move-bags-under-accessories.mjs --project atteya-store-dev --dry-run
 *   node scripts/move-bags-under-accessories.mjs --project atteya-store-dev --apply
 *
 * Prod (Youssef approval only — see docs/bags-under-accessories-prod-runbook.md):
 *   node scripts/move-bags-under-accessories.mjs --project attiya-store --apply --confirm-prod
 *
 * Requires Application Default Credentials with Firestore write access.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  if (next === undefined || next.startsWith('--')) return true;
  return next;
};

const projectId = arg('project');
const dryRun = arg('apply') !== true;
const confirmProd = arg('confirm-prod') === true;
const patchHomeShop = arg('patch-home-shop') === true;

if (!['atteya-store-dev', 'attiya-store'].includes(projectId)) {
  throw new Error('--project must be atteya-store-dev or attiya-store');
}
if (projectId === 'attiya-store' && !confirmProd) {
  throw new Error('Prod requires --confirm-prod. Follow the prod runbook first.');
}

const { recountCatalog } = require(join(__dirname, '../lib/products/catalog-counts.js'));

const BAGS_CATEGORY_PATCH = {
  parentId: 'accessories',
  ancestorIds: ['accessories'],
  path: 'accessories/bags',
  depth: 1,
  sortOrder: 50,
};

const EXPECTED_BAGS_CATEGORY_IDS = ['accessories', 'bags'];

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

async function patchBagsCategory() {
  const ref = db.doc('categories/bags');
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error('categories/bags is missing. Run catalogue migration (add pass) first.');
  }
  const data = snap.data() ?? {};
  const needsPatch =
    data.parentId !== BAGS_CATEGORY_PATCH.parentId ||
    !arraysEqual(data.ancestorIds ?? [], BAGS_CATEGORY_PATCH.ancestorIds) ||
    data.path !== BAGS_CATEGORY_PATCH.path ||
    data.depth !== BAGS_CATEGORY_PATCH.depth;

  console.log(
    needsPatch
      ? `${dryRun ? '[dry-run] Would repair' : 'Repairing'} categories/bags taxonomy`
      : 'categories/bags taxonomy already correct',
  );

  if (needsPatch && !dryRun) {
    await ref.set(
      {
        ...BAGS_CATEGORY_PATCH,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  return needsPatch;
}

async function forEachBagProduct(visit) {
  let lastId;
  for (;;) {
    let query = db
      .collection('products')
      .where('categoryIds', 'array-contains', 'bags')
      .orderBy(FieldPath.documentId())
      .limit(200);
    if (lastId) query = query.startAfter(lastId);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await visit(doc);
      lastId = doc.id;
    }
    if (snap.size < 200) break;
  }
}

async function patchBagProducts() {
  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let batch = db.batch();
  let batchWrites = 0;

  const commitBatch = async () => {
    if (batchWrites === 0) return;
    await batch.commit();
    batch = db.batch();
    batchWrites = 0;
  };

  await forEachBagProduct(async (docSnap) => {
    scanned += 1;
    const data = docSnap.data();
    const categoryIds = Array.isArray(data.categoryIds)
      ? data.categoryIds.filter((item) => typeof item === 'string' && item.length > 0)
      : [];
    const categoryId = typeof data.categoryId === 'string' ? data.categoryId : 'bags';
    const nextCategoryIds = EXPECTED_BAGS_CATEGORY_IDS;
    const nextCategoryId = categoryId === 'bags' || nextCategoryIds.includes(categoryId)
      ? categoryId === 'bags'
        ? 'bags'
        : categoryId
      : 'bags';

    const patch = {};
    if (!arraysEqual(categoryIds, nextCategoryIds)) {
      patch.categoryIds = nextCategoryIds;
    }
    if (nextCategoryId !== categoryId) {
      patch.categoryId = nextCategoryId;
    }

    if (Object.keys(patch).length === 0) return;

    wouldUpdate += 1;
    console.log(
      `${dryRun ? '[dry-run] Would update' : 'Updating'} products/${docSnap.id}: categoryIds -> [${nextCategoryIds.join(', ')}]`,
    );

    if (!dryRun) {
      batch.update(docSnap.ref, {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'move-bags-under-accessories',
      });
      batchWrites += 1;
      updated += 1;
      if (batchWrites >= 400) {
        await commitBatch();
      }
    }
  });

  if (!dryRun) {
    await commitBatch();
  }

  console.log(`Bag products scanned: ${scanned}, ${dryRun ? 'would update' : 'updated'}: ${wouldUpdate || updated}`);
  return wouldUpdate || updated;
}

async function patchHomeShopPadelCard() {
  const ref = db.doc('settings/home');
  const snap = await ref.get();
  if (!snap.exists) {
    console.log('settings/home missing — skipping home shop patch');
    return false;
  }
  const data = snap.data() ?? {};
  const shop = data.shopCategories;
  if (!shop || !Array.isArray(shop.cards) || shop.cards.length === 0) {
    console.log('settings/home has no shopCategories.cards — skipping');
    return false;
  }
  const first = shop.cards[0];
  const nextFirst = {
    ...first,
    buttonLabel: 'padel',
    buttonLink: '/category/rackets',
    imageAlt:
      typeof first.imageAlt === 'string' && first.imageAlt.includes('shoes')
        ? 'Professional padel rackets ready for court play'
        : first.imageAlt || 'Professional padel rackets ready for court play',
  };
  const unchanged =
    first.buttonLabel === nextFirst.buttonLabel &&
    first.buttonLink === nextFirst.buttonLink &&
    first.imageAlt === nextFirst.imageAlt;
  if (unchanged) {
    console.log('settings/home shop card 1 already matches padel / rackets');
    return false;
  }
  console.log(`${dryRun ? '[dry-run] Would patch' : 'Patching'} settings/home shop card 1 → padel /category/rackets`);
  if (!dryRun) {
    const cards = [...shop.cards];
    cards[0] = nextFirst;
    await ref.set(
      {
        shopCategories: { ...shop, cards },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'move-bags-under-accessories',
      },
      { merge: true },
    );
  }
  return true;
}

async function main() {
  console.log(`Project: ${projectId}, mode: ${dryRun ? 'dry-run' : 'apply'}`);
  await patchBagsCategory();
  await patchBagProducts();
  if (patchHomeShop) {
    await patchHomeShopPadelCard();
  }
  if (!dryRun) {
    console.log('Recounting settings/catalog and category productCount…');
    await recountCatalog(db, { categoryIds: ['bags', 'accessories'] });
  } else {
    console.log('Dry run complete. Re-run with --apply to write, then counts refresh via recountCatalog.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
