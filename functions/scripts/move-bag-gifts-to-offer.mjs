/**
 * One-off (ATS-74): take the free shirt and socks off the 5 bag bundles, so one admin Free gift
 * offer gives them instead (Admin -> Offers, shown on the product page as the Gift Box).
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/move-bag-gifts-to-offer.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/move-bag-gifts-to-offer.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/move-bag-gifts-to-offer.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * For each bag in BAG_SLUGS it:
 * - removes every `gift` option ("Free shirt", "Free socks") and the shirt `size` option
 *   (only while the bag still has a `gift` option, so a size added later in the admin stays),
 * - turns the per-size stock into one plain count with `stockFields()` (the sum of today's
 *   per-size counts), so the bag stays in stock, and deletes `stockBySize`,
 * - removes Arabic lines from `descriptionHtml` and `details` (the old offer text).
 *
 * The dry run lists, per bag, the options it removes, stock before and after, and each gift
 * choice it found with the product it matches (or that it couldn't match). Then it checks the
 * products the offer gives (OFFER_GIFTS): found, published, in stock, and no second choice
 * besides size (the Gift Box and checkout can't give those). Last it prints the exact offer to
 * create in Admin -> Offers, and any Free gift offer that already covers these bags.
 *
 * Skipped and only listed: a bag that isn't found, or has `variants` rows (they point at the
 * options being removed). Each write is checked against the document's last update time, so a
 * bag edited while the script runs is skipped instead of overwritten; run it again to pick it
 * up. Re-running is safe: a bag with no `gift` option and no Arabic text is left alone.
 *
 * Shoppers' bags are never edited. A bag line saved before this runs still holds the old shirt,
 * socks or size choice; the order callables refuse it ("One item in your bag has changed since you
 * added it. Remove it and add it again.", `order-selection.ts`), so it can't be bought without the
 * free gifts or mixed with a new line for the same bag. The dry run counts the saved account bags
 * that hold one (guest bags stay in the browser and can't be counted).
 *
 * Old orders keep their saved `optionLabels`, so they still show the shirt and socks ordered.
 * After applying, run "Rebuild search" in Catalogue Tools (the bags leave the Shop size
 * filter). Agents never run --apply and never create the offer.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** The 5 bag bundles from the old store import. */
const BAG_SLUGS = ['adidas-bag-blue', 'adidas-black', 'adidas-bag-red', 'adidas-pro-tour', 'siux-edge-bag'];

/** The offer's gifts (decided on ATS-74): each choice is a real product, by slug. */
const OFFER_GIFTS = [
  {
    name: 'Free shirt',
    slugs: ['adidas-polo-white', 'adidas-polo-gray', 'on-polo', 'bullpadel-white-shirt'],
  },
  {
    name: 'Free socks',
    slugs: ['on-socks-black', 'on-white-socks', 'socks', 'siuxsocks', 'siuxsocksblack'],
  },
];

/**
 * Gift choice label on the bags -> the product it is, per gift option. Each one was matched by
 * its photo: the bag's gift photo is the same file as that product's photo.
 */
const LABEL_MATCHES = {
  'free shirt': {
    'POLO WHITE': 'adidas-polo-white',
    'POLO BLACK': 'adidas-polo-gray',
    'ON POLO BALCK': 'on-polo',
    'ON POLO BLACK': 'on-polo',
    'BULLPADEL WHITE': 'bullpadel-white-shirt',
    BLACK: 'adidas-shirt-galan-2',
    WHITE: 'adidas-tshirt-galan',
    'NAVY BLUE': 'adidas-navy-blue',
    ORANGE: 'adidas-orange',
    'SIUX RED': 'siux-tshirt1',
    'SIUX BLACK/RED': 'siux-red',
  },
  'free socks': {
    'ON BLACK': 'on-socks-black',
    'ON WHITE': 'on-white-socks',
    'BULLPADEL WHITE': 'socks',
    'SIUX WHITE': 'siuxsocks',
    'SIUX BLACK': 'siuxsocksblack',
    BABOLAT: 'babolat-socks',
  },
};

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  if (next === undefined || next.startsWith('--')) return true;
  return next;
};

const projectId = arg('project');
if (!['atteya-store-dev', 'attiya-store'].includes(projectId)) {
  throw new Error('--project must be atteya-store-dev or attiya-store');
}
const apply = arg('apply') === true;
if (apply && projectId === 'attiya-store' && arg('confirm-prod') !== true) {
  throw new Error('Writing to prod requires --confirm-prod.');
}

const { stockFields } = require(join(__dirname, '../lib/products/stock.js'));

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const asList = (value) => (Array.isArray(value) ? value : []);
/** "SIUX  black\red" -> "SIUX BLACK/RED". */
const labelKey = (value) => trimmed(value).toUpperCase().replaceAll('\\', '/').split(/\s+/).join(' ');

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const unescapeHtml = (value) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&');

/** `<p>a<br>b</p><p>c</p>` -> [['a', 'b'], ['c']]. Null when the HTML holds anything else. */
function readParagraphs(html) {
  const paragraphs = [];
  let rest = html.trim();
  while (rest.length > 0) {
    if (!rest.startsWith('<p>')) return null;
    const end = rest.indexOf('</p>');
    if (end === -1) return null;
    const inner = rest.slice(3, end);
    rest = rest.slice(end + 4).trim();
    const lines = inner.split(/<br\s*\/?>/i);
    if (lines.some((line) => line.includes('<') || line.includes('>'))) return null;
    paragraphs.push(lines.map((line) => unescapeHtml(line).trim()).filter((line) => line.length > 0));
  }
  return paragraphs;
}

/** Same output as descriptionToHtml() in src/products/product-form.ts. */
const paragraphsToHtml = (paragraphs) => {
  const kept = paragraphs.filter((lines) => lines.length > 0);
  if (kept.length === 0) return null;
  return kept.map((lines) => `<p>${lines.map(escapeHtml).join('<br>')}</p>`).join('');
};

/** { html } without the Arabic lines, { html: unchanged } when there are none, or { reason }. */
function withoutArabicDescription(html) {
  if (!ARABIC.test(html)) return { html, removed: 0 };
  const paragraphs = readParagraphs(html);
  if (paragraphs === null) return { reason: 'its description has Arabic text in other formatting' };
  let removed = 0;
  const kept = paragraphs.map((lines) =>
    lines.filter((line) => {
      if (!ARABIC.test(line)) return true;
      removed += 1;
      return false;
    }),
  );
  return { html: paragraphsToHtml(kept), removed };
}

/** A product doc by slug (published or not), or null. */
async function productBySlug(slug) {
  const page = await db.collection('products').where('slug', '==', slug).limit(2).get();
  if (page.size > 1) console.log(`NOTE     more than one product has the slug "${slug}"; using ${page.docs[0].id}`);
  return page.empty ? null : page.docs[0];
}

const offerSlugs = new Map(OFFER_GIFTS.flatMap((gift) => gift.slugs.map((slug) => [slug, gift.name])));
const bagDocs = [];
let changed = 0;
let raced = 0;
const left = [];

for (const slug of BAG_SLUGS) {
  const snap = await productBySlug(slug);
  if (!snap) {
    left.push(`LEFT     ${slug} not found`);
    continue;
  }
  bagDocs.push(snap);
  const data = snap.data();
  const name = trimmed(data.name) || slug;
  const options = asList(data.options);
  const giftOptions = options.filter((option) => option?.key === 'gift');
  const sizeOption = options.find((option) => option?.key === 'size');

  console.log(`\n${name}  (${slug}, ${snap.id})`);

  if (asList(data.variants).length > 0) {
    left.push(`LEFT     ${slug} has ${data.variants.length} variant rows that point at its options; fix it in the admin`);
    console.log('  left alone: it has variant rows');
    continue;
  }

  const patch = {};
  const removedOptions = [];

  if (giftOptions.length > 0) {
    for (const option of giftOptions) {
      const optionLabel = trimmed(option.label) || 'gift';
      const matches = LABEL_MATCHES[optionLabel.toLowerCase()] ?? {};
      removedOptions.push(`"${optionLabel}" (${asList(option.values).length} choices)`);
      console.log(`  ${optionLabel}:`);
      for (const value of asList(option.values)) {
        const label = trimmed(value?.label);
        const match = matches[labelKey(label)];
        const where = !match
          ? "couldn't match to a product"
          : offerSlugs.get(match) === optionLabel
            ? `-> ${match} (in the offer)`
            : `-> ${match} (not in the offer)`;
        console.log(`    ${label.padEnd(18)} ${where}`);
      }
    }
    if (sizeOption) {
      const labels = asList(sizeOption.values).map((value) => trimmed(value?.label)).join(', ');
      removedOptions.push(`"${trimmed(sizeOption.label) || 'Size'}" (${labels})`);
    }
    patch.options = options.filter((option) => option?.key !== 'gift' && option?.key !== 'size');
    console.log(`  options removed: ${removedOptions.join(', ')}`);

    const map = data.stockBySize;
    const hasMap = map !== null && typeof map === 'object' && !Array.isArray(map);
    if (hasMap || typeof data.stock === 'number') {
      const total = hasMap ? stockFields(map).stock : data.stock;
      const next = stockFields(null, total);
      patch.stock = next.stock;
      patch.stockBySize = FieldValue.delete();
      patch.inStock = next.inStock;
      const before = hasMap
        ? `${data.stock ?? 'none'} (by size: ${Object.values(map).join(' + ') || 'none'})`
        : `${data.stock}`;
      console.log(`  stock: ${before} -> ${next.stock}${next.inStock ? '' : ' (out of stock)'}`);
    } else {
      console.log('  stock: no count saved; set it in the product form after this runs');
    }
  } else if (sizeOption) {
    console.log('  no gift options; its size option is left alone (check it in the product form)');
  } else {
    console.log('  no gift options (already done)');
  }

  const html = trimmed(data.descriptionHtml);
  if (html) {
    const result = withoutArabicDescription(html);
    if (result.reason) {
      left.push(`LEFT     ${slug} ${result.reason}; remove it in the product form`);
      console.log(`  description: ${result.reason}, left as it is`);
    } else if (result.removed > 0) {
      patch.descriptionHtml = result.html;
      console.log(`  description: ${result.removed} Arabic lines removed`);
    }
  }
  const details = asList(data.details);
  const keptDetails = details.filter((line) => !ARABIC.test(trimmed(line)));
  if (keptDetails.length !== details.length) {
    patch.details = keptDetails;
    console.log(`  details: ${details.length - keptDetails.length} Arabic lines removed`);
  }
  if (ARABIC.test(trimmed(data.summary)) || ARABIC.test(trimmed(data.name))) {
    left.push(`LEFT     ${slug} has Arabic text in its name or summary; change it in the product form`);
  }

  if (Object.keys(patch).length === 0) continue;
  console.log(`  ${apply ? 'WRITE' : 'WOULD WRITE'}`);
  if (apply) {
    try {
      await snap.ref.update(
        { ...patch, updatedAt: FieldValue.serverTimestamp() },
        { lastUpdateTime: snap.updateTime },
      );
    } catch (error) {
      raced += 1;
      console.log(`  SKIP: changed while the script ran (${error.message}); run again`);
      continue;
    }
  }
  changed += 1;
}

// Saved account bags (`carts/{uid}`) that still hold one of these bags with the old choices. They
// are only counted: once the options are gone, checkout refuses such a line ("One item in your bag
// has changed since you added it. Remove it and add it again."), so the shopper adds it again from
// the product page and picks the free gifts there. Guest bags live in browsers and can't be counted.
const bagIdSet = new Set(bagDocs.map((snap) => snap.id));
let savedBags = 0;
let savedLines = 0;
let cursor = null;
for (;;) {
  let page = db.collection('carts').orderBy('__name__').limit(300);
  if (cursor) page = page.startAfter(cursor);
  const snap = await page.get();
  for (const cart of snap.docs) {
    const stale = asList(cart.data().lines).filter((line) => {
      const selection = line?.selection;
      return (
        bagIdSet.has(line?.productId) &&
        selection !== null &&
        typeof selection === 'object' &&
        ('gift' in selection || 'size' in selection)
      );
    });
    if (stale.length > 0) {
      savedBags += 1;
      savedLines += stale.length;
    }
  }
  if (snap.size < 300) break;
  cursor = snap.docs[snap.docs.length - 1];
}
console.log(
  savedBags > 0
    ? `\nSaved account bags with one of these bags and its old choices: ${savedBags} (${savedLines} lines). ` +
        'After --apply, checkout asks those shoppers to remove it and add it again, so they pick the free gifts.'
    : '\nNo saved account bag holds one of these bags with its old choices.',
);

console.log('\nGift products the offer gives:');
const giftIds = new Map();
for (const gift of OFFER_GIFTS) {
  console.log(`  ${gift.name}:`);
  const ids = [];
  for (const slug of gift.slugs) {
    const snap = await productBySlug(slug);
    if (!snap) {
      console.log(`    ${slug.padEnd(24)} NOT FOUND`);
      continue;
    }
    ids.push(snap.id);
    const data = snap.data();
    const problems = [];
    if (data.published !== true) problems.push('not published');
    const stock = typeof data.stock === 'number' ? data.stock : data.inStock === false ? 0 : null;
    if (stock === 0) problems.push('out of stock');
    for (const option of asList(data.options)) {
      if (option?.key === 'size') continue;
      const count = asList(option?.values).length;
      if (count > 1) {
        problems.push(
          `has a "${trimmed(option.label) || option.key}" choice with ${count} values, so it can't be ` +
            'given as a gift until that choice is removed in the product form',
        );
      }
    }
    const note = problems.length > 0 ? `  WARNING: ${problems.join('; ')}` : '  ok';
    console.log(`    ${slug.padEnd(24)} ${snap.id}  ${trimmed(data.name)}${note}`);
  }
  giftIds.set(gift.name, ids);
}

console.log('\nCreate this offer in Admin -> Offers (new offer):');
console.log('  Name: Free shirt and socks with racket bags');
console.log('  Title: Free shirt and socks');
console.log('  Visibility: Public, Active');
console.log('  Applies to (Specific product):');
for (const snap of bagDocs) console.log(`    ${trimmed(snap.data().name)}  (${snap.data().slug}, ${snap.id})`);
console.log('  What shoppers get: Free gift');
for (const gift of OFFER_GIFTS) {
  console.log(`    Gift "${gift.name}", products shoppers can choose from: ${giftIds.get(gift.name).join(', ')}`);
}

const bagIds = new Set(bagDocs.map((snap) => snap.id));
const offers = await db.collection('offers').limit(500).get();
const covering = [];
for (const snap of offers.docs) {
  const data = snap.data();
  if (data.reward?.kind !== 'freeGift') continue;
  const ids = asList(data.conditions?.anyOf).flatMap((group) =>
    asList(group?.allOf)
      .filter((atom) => atom?.field === 'productId')
      .flatMap((atom) => asList(atom.in)),
  );
  const hits = ids.filter((id) => bagIds.has(id));
  if (hits.length > 0) {
    covering.push(`  ${trimmed(data.name) || snap.id} (${snap.id}), ${data.active ? 'active' : 'not active'}, ${hits.length} of the bags`);
  }
}
console.log(
  covering.length > 0
    ? `\nFree gift offers that already cover these bags:\n${covering.join('\n')}`
    : '\nNo Free gift offer covers these bags yet.',
);

if (left.length > 0) {
  console.log('\nNot changed:');
  for (const line of left) console.log(line);
}

console.log(
  `\n${apply ? 'Changed' : 'Would change'} ${changed} of ${BAG_SLUGS.length} bags` +
    `${apply ? `, changed meanwhile ${raced}` : ''}.` +
    (apply
      ? ' Now run Catalogue Tools -> Rebuild search.'
      : ' Dry run only; add --apply to write.'),
);
