/**
 * One-off (ATS-80): split each product's long description into a short Description and a
 * Details list, for the product page's Materials / Specifications section.
 *
 * Run from the functions directory with Application Default Credentials, dev first:
 *   node scripts/split-product-details.mjs --project atteya-store-dev                          (dry run)
 *   node scripts/split-product-details.mjs --project atteya-store-dev --apply                  (writes)
 *   node scripts/split-product-details.mjs --project attiya-store --apply --confirm-prod       (prod)
 *
 * Reads the shape the ATS-69 copy cleanup left (`apply-product-copy.mjs`): `descriptionHtml`
 * made of `<p>` paragraphs with `<br>` line breaks, one or two plain sentences first, then the
 * facts as lines starting with "• ".
 * - The text before the first "• " line becomes the new `descriptionHtml` (same HTML as the
 *   product form's `descriptionToHtml`).
 * - Each "• " line becomes one `details` line, without the bullet.
 *
 * Changes nothing, and only lists, a product that:
 * - already has `details` (already split, or typed in the admin),
 * - has no "• " line (its description is already prose only),
 * - has any other HTML (lists, links, formatting from the old store),
 * - has plain text after its "• " lines,
 * - would get more than 20 details lines or a line over 200 characters.
 *
 * Each write is checked against the document's last update time, so a product edited while the
 * script runs is skipped instead of overwritten; run it again to pick it up. Re-running is safe.
 * Writing `descriptionHtml` re-syncs the search record on its own (no Rebuild search needed).
 * Agents never run --apply.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const MAX_DETAIL_LINES = 20;
const MAX_DETAIL_LINE = 200;
const BULLET = '•';

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

const collapseSpaces = (value) => value.trim().split(/\s+/).filter(Boolean).join(' ');

/** Same output as descriptionToHtml() in src/products/product-form.ts, from paragraphs of lines. */
const paragraphsToHtml = (paragraphs) => {
  const kept = paragraphs.filter((lines) => lines.length > 0);
  if (kept.length === 0) return null;
  return kept.map((lines) => `<p>${lines.map(escapeHtml).join('<br>')}</p>`).join('');
};

/**
 * `<p>a<br>b</p><p>c</p>` -> [['a', 'b'], ['c']]. Null when the HTML holds anything else
 * (other tags, text outside a paragraph).
 */
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

/** { descriptionHtml, details } or { reason } when the product can't be split cleanly. */
function split(html) {
  const paragraphs = readParagraphs(html);
  if (paragraphs === null) return { reason: 'has other formatting' };

  const prose = [];
  const details = [];
  for (const lines of paragraphs) {
    const proseLines = [];
    for (const line of lines) {
      if (line.startsWith(BULLET)) {
        details.push(collapseSpaces(line.slice(BULLET.length)));
      } else if (details.length > 0) {
        return { reason: `has text after the "${BULLET}" lines: "${line.slice(0, 60)}"` };
      } else {
        proseLines.push(line);
      }
    }
    if (proseLines.length > 0) prose.push(proseLines);
  }

  if (details.length === 0) return { reason: `has no "${BULLET}" lines (already prose only)` };
  const kept = details.filter((line) => line.length > 0);
  if (kept.length > MAX_DETAIL_LINES) return { reason: `would get ${kept.length} details lines (max 20)` };
  const long = kept.find((line) => line.length > MAX_DETAIL_LINE);
  if (long) return { reason: `has a details line over 200 characters: "${long.slice(0, 60)}…"` };
  return { descriptionHtml: paragraphsToHtml(prose), details: kept };
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const snapshot = await db.collection('products').get();

let changed = 0;
let alreadySplit = 0;
let noDescription = 0;
let raced = 0;
const listed = [];

for (const snap of snapshot.docs) {
  const data = snap.data();
  const slug = typeof data.slug === 'string' ? data.slug : snap.id;
  if (Array.isArray(data.details) && data.details.length > 0) {
    alreadySplit += 1;
    continue;
  }
  const html = typeof data.descriptionHtml === 'string' ? data.descriptionHtml.trim() : '';
  if (html.length === 0) {
    noDescription += 1;
    continue;
  }

  const result = split(html);
  if (result.reason) {
    listed.push(`LEFT     ${slug} (${snap.id}) ${result.reason}`);
    continue;
  }

  const note = `${result.details.length} details lines${result.descriptionHtml ? '' : ', description now empty'}`;
  console.log(`${apply ? 'WRITE   ' : 'WOULD   '} ${slug}  ${note}`);
  if (apply) {
    try {
      await snap.ref.update(
        {
          descriptionHtml: result.descriptionHtml,
          details: result.details,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { lastUpdateTime: snap.updateTime },
      );
    } catch (error) {
      raced += 1;
      console.log(`SKIP     ${slug} changed while the script ran (${error.message}); run again`);
      continue;
    }
  }
  changed += 1;
}

if (listed.length > 0) {
  console.log(`\nNot changed (fix these by hand in the admin product form if they need details):`);
  for (const line of listed) console.log(line);
}

console.log(
  `\n${snapshot.size} products. ${apply ? 'Split' : 'Would split'} ${changed}, already have details ` +
    `${alreadySplit}, no description ${noDescription}, left as they are ${listed.length}` +
    `${apply ? `, changed meanwhile ${raced}` : ''}.` +
    (apply ? '' : ' Dry run only; add --apply to write.'),
);
