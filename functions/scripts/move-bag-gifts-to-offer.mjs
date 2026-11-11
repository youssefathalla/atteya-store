/**
 * One-off (ATS-74, ATS-111): take the free shirt and socks off the 5 bag bundles and give each
 * bag its own Free gift offer instead (Admin -> Offers, shown on the product page as the Gift Box).
 * Each bag keeps the gifts it offers today (BAGS below), and the script creates the offers itself.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   npm run build
 *   node scripts/move-bag-gifts-to-offer.mjs --project atteya-store-dev                       (dry run)
 *   node scripts/move-bag-gifts-to-offer.mjs --project atteya-store-dev --apply               (writes)
 *   node scripts/move-bag-gifts-to-offer.mjs --project attiya-store --apply --confirm-prod    (prod)
 *
 * For each bag in BAGS it:
 * - removes every `gift` option ("Free shirt", "Free socks") and the shirt `size` option
 *   (only while the bag still has a `gift` option, so a size added later in the admin stays),
 * - turns the per-size stock into one plain count with `stockFields()` (the sum of today's
 *   per-size counts), so the bag stays in stock, and deletes `stockBySize`,
 * - removes Arabic lines from `descriptionHtml` and `details` (the old offer text),
 * - creates (or updates) the bag's own Free gift offer `offers/bag-gifts-<bag id>`: name
 *   "Free shirt and socks with <bag name>", title "Free shirt and socks", public, active, applies
 *   to that one bag, reward Free gift with "Free shirt" and "Free socks" (only the gifts the bag
 *   has choices for). The document has the same fields and shape Admin -> Offers saves
 *   (`offers-admin.service.ts`) and is checked with the shared engine's `validateOffer()` first,
 *   so it opens and edits normally in the admin.
 *
 * Each bag's gift list comes from its choices today: every choice label is mapped to the product
 * it is (BAGS), matched by photo (the bag's gift photo is the same file as that product's photo,
 * or, where the old store used a different photo, the same item: colour, print and brand). A label
 * mapped to null has no real product; it is left out and listed.
 *
 * The dry run (default) lists, per bag: the options it removes, stock before and after, each
 * choice and the product it maps to, the gift list with each product's status (found, published,
 * in stock, gift-ready: no second choice besides size, which the Gift Box and checkout can't give)
 * and the offer it would create or update.
 *
 * Re-running is safe: a bag with no `gift` option and no Arabic text is left alone, and its offer
 * is found by its fixed id. An existing offer gets only the script's fields (name, title, public,
 * the bag, the gifts); staff changes to active, archived, priority, schedule, badge, description
 * and limits are kept, and an offer that already matches is not written.
 *
 * The offer's name stays within the admin's 80-character limit: when two bags share a name the slug
 * saved on the product (never the `id:` reference from BAGS) follows it, and a long bag name is cut
 * with "…". A bag is written only after its offer passes the engine's check, so a bag whose offer
 * can't be created keeps its gift options (it is listed under "Not changed").
 *
 * Skipped and only listed (no offer either): a bag that isn't found, or has `variants` rows (they
 * point at the options being removed). Each bag write is checked against the document's last
 * update time, so a bag edited while the script runs is skipped instead of overwritten; run it
 * again to pick it up. Any other Free gift offer that covers a bag (for example the shared one from
 * the first version of this script) is listed: pause or archive it in Admin -> Offers.
 *
 * Shoppers' bags are never edited. A bag line saved before this runs still holds the old shirt,
 * socks or size choice; the order callables refuse it ("One item in your bag has changed since you
 * added it. Remove it and add it again.", `order-selection.ts`), so it can't be bought without the
 * free gifts or mixed with a new line for the same bag. The dry run counts the saved account bags
 * that hold one (guest bags stay in the browser and can't be counted). It also counts saved bag
 * lines whose free gifts come from another offer (any `gifts[].offerId` other than the bag's own
 * offer, such as the shared one from the first version), per offer: once that offer is paused or
 * archived those lines lose their free gifts (checkout asks the shopper to remove the bag and add
 * it again), so staff see the count before pausing it.
 *
 * Old orders keep their saved `optionLabels`, so they still show the shirt and socks ordered.
 * After applying, run "Rebuild search" in Catalogue Tools (the bags leave the Shop size
 * filter). On dev the manager agent may run --apply after a dry run; prod needs Youssef's OK (AGENTS.md, Deploy safety).
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The 5 bag bundles from the old store import, each with the gifts it offers today (ATS-111:
 * one Free gift offer per bag). Per gift: the bag's choice label (as `labelKey()` writes it) ->
 * the product it is, by slug, in the bag's order. Each was matched by photo: the bag's gift photo
 * is the same file as that product's photo, or (GREEN, ORANGE on the Protour and Multigame black
 * bags, SIUX WHITE, SIUX GREEN/BLACK, NOX BLACK, NOX WHITE) the same item in another photo. The
 * Nox pair photos match the main photo of each Nox socks page: `nox-socks` is the white pair and
 * `nox-socks-2` the black one. BULLPADEL is the Bullpadel pair (`socks`), the same photo the On
 * socks pages use for their Bullpadel choice. Set a label to null when it has no real product:
 * it is left out of the offer and listed.
 */
const BAGS = [
  {
    slug: 'adidas-bag-blue',
    gifts: {
      'Free shirt': {
        BLACK: 'adidas-shirt-galan-2',
        WHITE: 'adidas-tshirt-galan',
        GREEN: 'adidas-shirt-galan',
        ORANGE: 'adidas-orange',
        'NAVY BLUE': 'adidas-navy-blue',
      },
      'Free socks': {
        'NOX BLACK': 'nox-socks-2',
        BULLPADEL: 'socks',
        BABOLAT: 'babolat-socks',
        'SIUX BLACK': 'siuxsocksblack',
      },
    },
  },
  {
    slug: 'adidas-black',
    gifts: {
      'Free shirt': {
        BLACK: 'adidas-shirt-galan-2',
        WHITE: 'adidas-tshirt-galan',
        ORANGE: 'adidas-orange',
        'POLO WHITE': 'adidas-polo-white',
        'POLO BLACK': 'adidas-polo-gray',
      },
      'Free socks': {
        'NOX WHITE': 'nox-socks',
        'NOX BLACK': 'nox-socks-2',
        'ON WHITE': 'on-white-socks',
        'ON BLACK': 'on-socks-black',
      },
    },
  },
  {
    slug: 'adidas-bag-red',
    gifts: {
      'Free shirt': {
        'POLO WHITE': 'adidas-polo-white',
        'POLO BLACK': 'adidas-polo-gray',
        'ON POLO BALCK': 'on-polo',
        'BULLPADEL WHITE': 'bullpadel-white-shirt',
      },
      'Free socks': {
        'ON BLACK': 'on-socks-black',
        'ON WHITE': 'on-white-socks',
        'BULLPADEL WHITE': 'socks',
        'SIUX WHITE': 'siuxsocks',
        'SIUX BLACK': 'siuxsocksblack',
      },
    },
  },
  {
    slug: 'adidas-pro-tour',
    gifts: {
      'Free shirt': {
        WHITE: 'adidas-tshirt-galan',
        BLACK: 'adidas-shirt-galan-2',
        ORANGE: 'adidas-orange',
        'NAVY BLUE': 'adidas-navy-blue',
        GREEN: 'adidas-shirt-galan',
      },
      'Free socks': {
        'SIUX BLACK': 'siuxsocksblack',
        'SIUX WHITE': 'siuxsocks',
        BABOLAT: 'babolat-socks',
        BULLPADEL: 'socks',
      },
    },
  },
  {
    // Added Nov 2026: missed by the first run (the white Multigame bag, `adidas-ofwhite` on prod,
    // `adidas-multigame-racket-bag-white` on dev after the slug clean-up). Its slug differs between
    // projects, so it and its gifts are named by document id (`id:`), which is the same on both.
    // Matched by photo: its second "BABOLAT" choice is the Bullpadel pair (Bullpadel logo), so that
    // one is keyed by its value id.
    slug: 'id:eo-1e19afe4-4c6d-4eda-95ec-c3d3f123fa38',
    gifts: {
      'Free shirt': {
        'ADIDAS WHITE': 'id:eo-fc62ec11-6cac-4516-9bf3-53ec9d989236',
        'ADIDAS BLACK': 'id:eo-da3c8d5a-8e43-4295-9b36-1e7dab4091d2',
        'ADIDAS POLO GRAY': 'id:eo-325839fb-5572-4cf5-9c63-ef42c445207d',
        'POLO WHITE': 'id:eo-5812cfbe-840e-42fa-8a40-007445107e8d',
        ORANGE: 'id:eo-5bdbcf3a-4d9a-4d8a-8d18-1f50ee540c08',
      },
      'Free socks': {
        'ON BLACK': 'id:eo-e8bb355b-8089-4446-8f0a-5139becce1e0',
        'ON WHITE': 'id:eo-618666e6-0bdc-4564-b53a-ac06b827d424',
        BABOLAT: 'id:eo-98eee1ee-1fe5-4100-afb4-68d42b3bd869',
        '9550fbde-20b6-4d5c-9139-3d4f96fed0a7': 'id:eo-7804d7ac-0526-4e17-9975-0ed422d3970c',
      },
    },
  },
  {
    slug: 'siux-edge-bag',
    gifts: {
      'Free shirt': {
        'SIUX WHITE': 'siux-t-shirt',
        'SIUX RED': 'siux-tshirt1',
        'SIUX BLACK/RED': 'siux-red',
        'SIUX GREEN/BLACK': 'siux-tshirt-2',
      },
      'Free socks': {
        'SIUX BLACK': 'siuxsocksblack',
        'SIUX WHITE': 'siuxsocks',
        BULLPADEL: 'socks',
        BABOLAT: 'babolat-socks',
      },
    },
  },
];

/** Gift name -> its fixed id inside the offer (bag lines and orders point at it). */
const GIFT_IDS = { 'Free shirt': 'gift-1', 'Free socks': 'gift-2' };

/** Each bag's offer lives at a fixed id, so running again updates it instead of adding another. */
const OFFER_ID_PREFIX = 'bag-gifts-';
const UPDATED_BY = 'script:move-bag-gifts-to-offer';

/** Admin -> Offers (`validateOffer()`) accepts an internal name of at most 80 characters. */
const MAX_OFFER_NAME = 80;

/** `prefix + name + suffix`, with the bag's name cut (ending in "…") when it would pass 80 characters. */
function fitOfferName(prefix, name, suffix) {
  const full = `${prefix}${name}${suffix}`;
  if (full.length <= MAX_OFFER_NAME) return full;
  const room = MAX_OFFER_NAME - prefix.length - suffix.length - 1;
  if (room < 1) return full.slice(0, MAX_OFFER_NAME).trimEnd();
  return `${prefix}${name.slice(0, room).trimEnd()}…${suffix}`;
}

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
const { validateOffer } = require(join(__dirname, '../lib/offers/engine/index.js'));
const { parseOfferDoc } = require(join(__dirname, '../lib/offers/offer-schema.js'));

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

/** A product doc by slug, or by document id when written as `id:<doc id>` (published or not), or null. */
async function productBySlug(slug) {
  if (slug.startsWith('id:')) {
    const snap = await db.doc(`products/${slug.slice(3)}`).get();
    return snap.exists ? snap : null;
  }
  const page = await db.collection('products').where('slug', '==', slug).limit(2).get();
  if (page.size > 1)
    console.log(`NOTE     more than one product has the slug "${slug}"; using ${page.docs[0].id}`);
  return page.empty ? null : page.docs[0];
}

/** Gift products and the other offers, read once. */
const productCache = new Map();
async function cachedProduct(slug) {
  if (!productCache.has(slug)) productCache.set(slug, await productBySlug(slug));
  return productCache.get(slug);
}

/** The engine's view of a product (same fields as toPricedProduct() in order-pricing.server.ts). */
function pricedProduct(snap) {
  const data = snap.data();
  const sizes = [];
  for (const option of asList(data.options)) {
    if (option?.key !== 'size') continue;
    for (const value of asList(option.values)) {
      const label = trimmed(value?.label);
      if (label && !sizes.includes(label)) sizes.push(label);
    }
  }
  const strings = (value) => asList(value).map(String);
  return {
    productId: snap.id,
    name: String(data.name ?? ''),
    brandId: String(data.brandId ?? ''),
    categoryIds: strings(data.categoryIds),
    type: String(data.type ?? ''),
    modelGroup: typeof data.modelGroup === 'string' ? data.modelGroup : null,
    colors: strings(data.colors),
    sizes,
    tags: strings(data.tags),
    price: Math.max(0, Math.round(Number(data.price ?? 0))),
    compareAtPrice:
      data.compareAtPrice === null || data.compareAtPrice === undefined
        ? null
        : Math.max(0, Math.round(Number(data.compareAtPrice))),
  };
}

/** Why a gift product can't be given yet (empty = gift-ready), as the Gift Box and checkout see it. */
function giftProblems(data) {
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
          'given as a gift until that choice is removed',
      );
    }
  }
  return problems;
}

/** JSON with sorted map keys, so a stored offer compares equal whatever order Firestore returns. */
const stableJson = (value) =>
  JSON.stringify(value, (_key, inner) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
const sameJson = (a, b) => stableJson(a) === stableJson(b);

const offerSnaps = await db.collection('offers').limit(500).get();
const otherOffers = offerSnaps.docs
  .map((snap) => parseOfferDoc(snap.id, snap.data(), null))
  .filter((offer) => offer !== null);

const bagIds = new Set();
const bagNames = new Map();
const bagSnaps = new Map();
for (const bag of BAGS) {
  const snap = await productBySlug(bag.slug);
  if (!snap) continue;
  bagSnaps.set(bag.slug, snap);
  bagIds.add(snap.id);
  const name = trimmed(snap.data().name) || bag.slug;
  bagNames.set(name, (bagNames.get(name) ?? 0) + 1);
}

let changed = 0;
let raced = 0;
let offersCreated = 0;
let offersUpdated = 0;
let offersSame = 0;
const left = [];

for (const bag of BAGS) {
  const slug = bag.slug;
  const snap = bagSnaps.get(slug);
  if (!snap) {
    left.push(`LEFT     ${slug} not found (no offer either)`);
    continue;
  }
  const data = snap.data();
  const name = trimmed(data.name) || slug;
  const options = asList(data.options);
  const giftOptions = options.filter((option) => option?.key === 'gift');
  const sizeOption = options.find((option) => option?.key === 'size');

  console.log(`\n${'='.repeat(78)}\n${name}  (${slug}, ${snap.id})`);

  if (asList(data.variants).length > 0) {
    left.push(
      `LEFT     ${slug} has ${data.variants.length} variant rows that point at its options; fix it in the admin (no offer either)`,
    );
    console.log('  left alone: it has variant rows, so no offer either');
    continue;
  }

  // 1. The bag's own document.
  const patch = {};
  const removedOptions = [];

  if (giftOptions.length > 0) {
    for (const option of giftOptions) {
      const optionLabel = trimmed(option.label) || 'gift';
      const giftName = Object.keys(bag.gifts).find((key) => key.toLowerCase() === optionLabel.toLowerCase());
      const matches = giftName ? bag.gifts[giftName] : {};
      removedOptions.push(`"${optionLabel}" (${asList(option.values).length} choices)`);
      console.log(`  ${optionLabel} choices today:`);
      for (const value of asList(option.values)) {
        const label = trimmed(value?.label);
        // A choice can be keyed by its value id when two choices share a label.
        const valueId = trimmed(value?.id);
        const key = valueId && valueId in matches ? valueId : labelKey(label);
        const where = !(key in matches)
          ? 'NOT IN THE LIST: add it to BAGS in this script, or it is not given'
          : matches[key] === null
            ? 'no real product, left out'
            : `-> ${matches[key]}`;
        console.log(`    ${label.padEnd(18)} ${where}`);
      }
    }
    if (sizeOption) {
      const labels = asList(sizeOption.values)
        .map((value) => trimmed(value?.label))
        .join(', ');
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

  // The bag is written only after its offer passes validation (step 3), so a bag never loses its
  // gift options while its offer can't be created.
  const bagChanges = Object.keys(patch).length > 0;
  const leaveBag = (why) => {
    if (bagChanges) console.log(`  bag: left as it is (${why})`);
  };

  // 2. The bag's gift list: every product it maps to, with its status.
  const gifts = [];
  const giftProducts = [];
  console.log('  gifts:');
  for (const [giftName, matches] of Object.entries(bag.gifts)) {
    const slugs = [...new Set(Object.values(matches).filter((match) => match !== null))];
    const productIds = [];
    console.log(`    ${giftName}:`);
    for (const giftSlug of slugs) {
      const giftSnap = await cachedProduct(giftSlug);
      if (!giftSnap) {
        left.push(`LEFT     ${giftSlug} (${giftName} on ${slug}) not found, left out of the offer`);
        console.log(`      ${giftSlug.padEnd(24)} NOT FOUND, left out`);
        continue;
      }
      productIds.push(giftSnap.id);
      giftProducts.push(giftSnap);
      const problems = giftProblems(giftSnap.data());
      const note =
        problems.length > 0 ? `WARNING: ${problems.join('; ')}` : 'ok (published, in stock, gift-ready)';
      console.log(`      ${giftSlug.padEnd(24)} ${giftSnap.id}  ${trimmed(giftSnap.data().name)}  ${note}`);
    }
    for (const [label, match] of Object.entries(matches)) {
      if (match === null) console.log(`      "${label}" has no real product, left out`);
    }
    if (productIds.length > 0) gifts.push({ id: GIFT_IDS[giftName], name: giftName, productIds });
  }

  // 3. The bag's own offer, written the way Admin -> Offers saves one.
  if (gifts.length === 0) {
    left.push(`LEFT     ${slug} has no gift products, so no offer and the bag is left as it is`);
    console.log('  offer: none (no gift products)');
    leaveBag('no offer');
    continue;
  }
  const hasShirt = gifts.some((gift) => gift.name === 'Free shirt');
  const hasSocks = gifts.some((gift) => gift.name === 'Free socks');
  const title = hasShirt && hasSocks ? 'Free shirt and socks' : gifts[0].name;
  // Two bags share a name (Multigame black and red), so the slug tells their offers apart. It is
  // the slug saved on the product (a bag found by document id has no readable slug in BAGS).
  const savedSlug = trimmed(data.slug) || snap.id;
  const offerName = fitOfferName(
    `${title} with `,
    name,
    (bagNames.get(name) ?? 0) > 1 ? ` (${savedSlug})` : '',
  );
  const offerId = `${OFFER_ID_PREFIX}${snap.id}`;
  const conditions = { anyOf: [{ allOf: [{ field: 'productId', in: [snap.id] }] }] };
  const reward = { kind: 'freeGift', gifts };

  const existingSnap = offerSnaps.docs.find((offerSnap) => offerSnap.id === offerId) ?? null;
  const existing = existingSnap ? parseOfferDoc(offerId, existingSnap.data(), null) : null;
  const draft = {
    id: offerId,
    name: offerName,
    title,
    badge: existing?.badge ?? null,
    description: existing?.description ?? null,
    active: existing ? existing.active : true,
    archived: existing ? existing.archived : false,
    visibility: 'public',
    audience: existing?.audience ?? 'everyone',
    schedule: existing?.schedule ?? { startsAt: null, endsAt: null, timezone: 'Africa/Cairo' },
    priority: existing?.priority ?? 0,
    stacking: existing?.stacking ?? 'stackable',
    saleItems: existing?.saleItems ?? 'bestOf',
    scope: 'item',
    conditions,
    exclude: { anyOf: [] },
    minimum: null,
    reward,
    limits: existing?.limits ?? { totalUses: null, perCustomer: null },
    requiresCode: false,
    code: null,
  };

  const { errors, warnings } = validateOffer(
    draft,
    [pricedProduct(snap), ...giftProducts.map(pricedProduct)],
    otherOffers,
    { now: new Date(), signedIn: true },
  );
  console.log(`  offer ${offerId}${existing ? ' (exists)' : ''}:`);
  console.log(`    Name: ${offerName}`);
  console.log(`    Title: ${title}`);
  console.log(
    `    Public, ${draft.active ? 'Active' : 'Paused'}${draft.archived ? ', Archived' : ''}; applies to ${name} only`,
  );
  for (const gift of gifts) {
    console.log(`    Gift "${gift.name}" (${gift.id}): ${gift.productIds.join(', ')}`);
  }
  for (const warning of warnings) console.log(`    note: ${warning.message}`);
  if (errors.length > 0) {
    for (const error of errors) console.log(`    ERROR: ${error.message}`);
    left.push(
      `LEFT     ${slug} offer not written, so the bag is left as it is: ${errors.map((error) => error.message).join(' ')}`,
    );
    leaveBag('its offer did not pass validation');
    continue;
  }

  // The offer is valid: now the bag's own document.
  if (bagChanges) {
    console.log(`  bag: ${apply ? 'WRITE' : 'WOULD WRITE'}`);
    if (apply) {
      try {
        await snap.ref.update(
          { ...patch, updatedAt: FieldValue.serverTimestamp() },
          { lastUpdateTime: snap.updateTime },
        );
      } catch (error) {
        raced += 1;
        left.push(`LEFT     ${slug} changed while the script ran; run again (no offer either)`);
        console.log(`  SKIP: changed while the script ran (${error.message}); run again`);
        continue;
      }
    }
    changed += 1;
  }

  // The fields the script owns. Staff settings (active, priority, schedule, …) stay as they are.
  const owned = {
    id: offerId,
    name: offerName,
    title,
    visibility: 'public',
    scope: 'item',
    conditions,
    exclude: { anyOf: [] },
    minimum: null,
    reward,
    requiresCode: false,
  };
  const stored = existingSnap?.data() ?? null;
  if (stored && Object.entries(owned).every(([key, value]) => sameJson(stored[key] ?? null, value))) {
    offersSame += 1;
    console.log('    already up to date');
    continue;
  }

  if (!existingSnap) {
    // Same document Admin -> Offers writes for a new offer (OffersAdminService.saveOffer()).
    const payload = {
      ...owned,
      badge: null,
      description: null,
      active: true,
      archived: false,
      audience: 'everyone',
      schedule: { startsAt: null, endsAt: null, timezone: 'Africa/Cairo' },
      priority: 0,
      stacking: 'stackable',
      saleItems: 'bestOf',
      limits: { totalUses: null, perCustomer: null },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: UPDATED_BY,
    };
    console.log(`    ${apply ? 'CREATE' : 'WOULD CREATE'}`);
    if (apply) {
      try {
        await db.collection('offers').doc(offerId).create(payload);
      } catch (error) {
        left.push(`LEFT     ${slug} offer was created meanwhile (${error.message}); run again`);
        console.log(`    SKIP: created meanwhile (${error.message}); run again`);
        continue;
      }
    }
    offersCreated += 1;
  } else {
    console.log(`    ${apply ? 'UPDATE' : 'WOULD UPDATE'} (name, title, the bag and the gifts)`);
    if (apply) {
      try {
        // `reward` is replaced as a whole, so an old one-product gift's fields don't linger.
        await existingSnap.ref.update(
          { ...owned, updatedAt: FieldValue.serverTimestamp(), updatedBy: UPDATED_BY },
          { lastUpdateTime: existingSnap.updateTime },
        );
      } catch (error) {
        left.push(`LEFT     ${slug} offer changed while the script ran; run again`);
        console.log(`    SKIP: changed while the script ran (${error.message}); run again`);
        continue;
      }
    }
    offersUpdated += 1;
  }
}

// Saved account bags (`carts/{uid}`) are only counted, never edited. Guest bags live in browsers
// and can't be counted. Two kinds of line on these bags are counted:
// - old choices: the line still holds the old shirt, socks or size choice. Once the options are
//   gone, checkout refuses it ("One item in your bag has changed since you added it. Remove it and
//   add it again."), so the shopper adds it again from the product page and picks the free gifts.
// - gifts from another offer: the line's free gifts (`gifts[].offerId`) come from an offer that
//   isn't this bag's own `bag-gifts-<bag id>` offer, for example the shared one from the first
//   version of this script. Once that offer is paused or archived, checkout refuses the line ("The
//   free gift offer on one item in your bag has ended. Remove the item and add it again."), so
//   those shoppers lose the gifts they picked until they add the bag again.
let oldChoiceBags = 0;
let oldChoiceLines = 0;
let otherOfferBags = 0;
let otherOfferLines = 0;
/** Offer id -> { bags, lines } of saved bag lines whose gifts come from it. */
const savedByOffer = new Map();
let cursor = null;
for (;;) {
  let page = db.collection('carts').orderBy('__name__').limit(300);
  if (cursor) page = page.startAfter(cursor);
  const snap = await page.get();
  for (const cart of snap.docs) {
    let oldChoices = 0;
    let otherOffer = 0;
    const cartOffers = new Set();
    for (const line of asList(cart.data().lines)) {
      if (!bagIds.has(line?.productId)) continue;
      const selection = line.selection;
      if (
        selection !== null &&
        typeof selection === 'object' &&
        ('gift' in selection || 'size' in selection)
      ) {
        oldChoices += 1;
      }
      const ownOfferId = `${OFFER_ID_PREFIX}${line.productId}`;
      const offerIds = [
        ...new Set(
          asList(line.gifts)
            .map((gift) => (typeof gift?.offerId === 'string' ? gift.offerId : ''))
            .filter((offerId) => offerId !== '' && offerId !== ownOfferId),
        ),
      ];
      if (offerIds.length === 0) continue;
      otherOffer += 1;
      for (const offerId of offerIds) {
        const entry = savedByOffer.get(offerId) ?? { bags: 0, lines: 0 };
        entry.lines += 1;
        if (!cartOffers.has(offerId)) entry.bags += 1;
        cartOffers.add(offerId);
        savedByOffer.set(offerId, entry);
      }
    }
    if (oldChoices > 0) {
      oldChoiceBags += 1;
      oldChoiceLines += oldChoices;
    }
    if (otherOffer > 0) {
      otherOfferBags += 1;
      otherOfferLines += otherOffer;
    }
  }
  if (snap.size < 300) break;
  cursor = snap.docs[snap.docs.length - 1];
}
console.log(
  oldChoiceBags > 0
    ? `\nSaved account bags with one of these bags and its old choices: ${oldChoiceBags} (${oldChoiceLines} lines). ` +
        'After --apply, checkout asks those shoppers to remove it and add it again, so they pick the free gifts.'
    : '\nNo saved account bag holds one of these bags with its old choices.',
);
const offerNames = new Map(otherOffers.map((offer) => [offer.id, offer.name]));
const savedOfferLine = (offerId, { bags, lines }) =>
  `  ${offerNames.get(offerId) ?? 'offer not found'} (${offerId}): ${bags} saved bags, ${lines} lines`;
console.log(
  otherOfferBags > 0
    ? `Saved account bags with one of these bags whose free gifts come from another offer: ${otherOfferBags} ` +
        `(${otherOfferLines} lines):\n` +
        [...savedByOffer].map(([offerId, entry]) => savedOfferLine(offerId, entry)).join('\n')
    : 'No saved account bag holds one of these bags with free gifts from another offer.',
);

// Any other Free gift offer on these bags (for example the shared one from the first version of
// this script) would compete with the bag's own offer: the Gift Box shows the higher priority one.
const covering = [];
for (const offer of otherOffers) {
  if (offer.reward.kind !== 'freeGift' || offer.id.startsWith(OFFER_ID_PREFIX)) continue;
  const ids = offer.conditions.anyOf.flatMap((group) =>
    group.allOf.filter((atom) => atom.field === 'productId').flatMap((atom) => asList(atom.in)),
  );
  const hits = ids.filter((id) => bagIds.has(id));
  if (hits.length > 0) {
    const saved = savedByOffer.get(offer.id);
    const savedNote = saved
      ? `; ${saved.lines} lines in ${saved.bags} saved account bags pick their free gifts from it and lose them once it is paused or archived`
      : '';
    covering.push(
      `  ${offer.name} (${offer.id}), ${offer.archived ? 'archived' : offer.active ? 'ACTIVE' : 'paused'}, ${hits.length} of the bags${savedNote}`,
    );
  }
}
console.log(
  covering.length > 0
    ? `\nOther Free gift offers that cover these bags (pause or archive the active ones in Admin -> Offers):\n${covering.join('\n')}`
    : '\nNo other Free gift offer covers these bags.',
);
if (otherOfferLines > 0) {
  console.log(
    `Before pausing or archiving those offers: ${otherOfferLines} lines in ${otherOfferBags} saved account bags ` +
      'will lose their free gifts. Checkout asks those shoppers to remove the bag and add it again, and they ' +
      "pick the gifts from the bag's own offer. Shoppers' bags are not changed by this script.",
  );
}

if (left.length > 0) {
  console.log('\nNot changed:');
  for (const line of left) console.log(line);
}

const verb = apply ? '' : 'would be ';
console.log(
  `\nBags: ${apply ? 'changed' : 'would change'} ${changed} of ${BAGS.length}` +
    `${apply ? `, changed meanwhile ${raced}` : ''}. ` +
    `Offers: ${offersCreated} ${verb}created, ${offersUpdated} ${verb}updated, ${offersSame} already up to date.` +
    (apply ? ' Now run Catalogue Tools -> Rebuild search.' : ' Dry run only; add --apply to write.') +
    (otherOfferLines > 0
      ? ` Before pausing another Free gift offer on these bags, note that ${otherOfferLines} saved bag lines ` +
        'lose their free gifts from it (listed above).'
      : ''),
);
