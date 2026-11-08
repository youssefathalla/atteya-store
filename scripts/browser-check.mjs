#!/usr/bin/env node
/**
 * Browser check: opens the main storefront pages in Chromium at phone and desktop
 * size, takes a screenshot of each, and fails when a page is broken.
 *
 *   node scripts/browser-check.mjs [--base http://localhost:4000] [--out browser-check] [--product /product/<slug>]
 *
 * Expects the server-rendered store to be running already (`node dist/atteya-store/server/server.mjs`
 * with NG_ALLOWED_HOSTS=localhost,127.0.0.1). It reads live dev data (Firestore, Algolia,
 * ImageKit) through the public client config, like `ng serve` does.
 *
 * A page fails when:
 *   - its document answers with an error status, or the app sends it somewhere else (the
 *     store has no error page: an unknown route redirects home),
 *   - the page throws (pageerror) or logs a console error that is not in ALLOWED_CONSOLE,
 *   - a request to our own server fails or answers 4xx/5xx,
 *   - the main area is empty, the store loader never goes away, or what the page is for is
 *     missing (no product cards on Shop, no bag line in the bag, no email field on Sign In).
 * Each failed page is tried once more before it counts.
 *
 * Writes <out>/<page>-<size>.png, <out>/results.json and <out>/summary.md (the PR comment
 * body), and exits 1 when any page failed. Playwright is not a repo dependency: CI installs
 * it with `npm i --no-save playwright@<version>` (see .github/workflows/browser-check.yml).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:4000' },
    out: { type: 'string', default: 'browser-check' },
    // Product page to use when Shop shows none (local runs where Algolia is out of reach).
    product: { type: 'string' },
  },
});
const BASE = args.base.replace(/\/$/, '');
const OUT = args.out;
const ORIGIN = new URL(BASE).origin;

/** Bag key in localStorage (`CartService`, `src/app/core/services/cart/cart.service.ts`). */
const CART_KEY = 'atteya-cart-v1';
const NAV_TIMEOUT = 30_000;
/** How long a page may take to show what it is for (cards, the bag line, the form). */
const READY_TIMEOUT = 20_000;
/** Firestore keeps a connection open, so "network idle" never comes: wait a moment after load. */
const SETTLE_MS = 2_000;

const SIZES = [
  { id: 'phone', label: 'Phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { id: 'desktop', label: 'Desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
];

/**
 * Console errors that are not a broken page. Keep each one narrow and say why.
 * - Third-party resources (ImageKit photos still syncing, fonts, Algolia) log
 *   "Failed to load resource" with their own URL; those are listed as notes, not failures.
 */
const ALLOWED_CONSOLE = [
  // reCAPTCHA / App Check warm-up on localhost (App Check is not enforced on dev).
  /AppCheck|app-check|recaptcha/i,
  // The router's view transition is skipped when a second navigation or redirect starts
  // before the first one finished drawing; the page itself is fine.
  /AbortError: Transition was skipped/i,
];

/**
 * Angular's dev-mode performance hints are logged as console errors but do not break the page.
 * They show as notes in the comment so they are still seen.
 */
const PERFORMANCE_HINTS = [
  {
    // NgOptimizedImage: the largest image on screen (LCP) has no `priority`.
    pattern: /NG02955/,
    note: 'the largest photo on screen loads late (NgOptimizedImage NG02955: add `priority` to it).',
  },
];

/** Phrases that mean the page itself says it could not load. */
const BROKEN_PAGE_TEXT = /something went wrong|couldn['’]t load|could not load|page not found/i;

const results = [];
let productPath = args.product ?? null;
let productId = null;
let productName = null;
let productSelection = {};

// require() also finds a globally installed Playwright (NODE_PATH); CI installs it locally.
const { chromium } = createRequire(import.meta.url)('playwright');
await mkdir(OUT, { recursive: true });
// Sandboxes that only reach the internet through a proxy (HTTPS_PROXY) need Chromium to use it
// too; GitHub's runners have no proxy. The local server is always reached directly.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {});

try {
  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: size.viewport,
      isMobile: size.isMobile,
      hasTouch: size.hasTouch,
      deviceScaleFactor: 1,
      locale: 'en-US',
    });
    try {
      for (const page of pages()) {
        let result = await check(context, size, page);
        if (!result.ok) {
          const first = result.problems;
          result = await check(context, size, page);
          result.retried = true;
          if (!result.ok) result.firstTry = first;
        }
        results.push(result);
        const mark = result.skipped ? 'SKIP' : result.ok ? 'PASS' : 'FAIL';
        console.log(`${mark} ${size.id} ${page.id} ${result.path ?? ''}`);
        for (const problem of result.problems) console.log(`     ${problem}`);
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok && !r.skipped);
await writeFile(join(OUT, 'results.json'), JSON.stringify({ base: BASE, results }, null, 2));
await writeFile(join(OUT, 'summary.md'), summary());
console.log(failed.length ? `\n${failed.length} page check(s) failed.` : '\nAll pages passed.');
process.exit(failed.length ? 1 : 0);

/** The pages to open, in order. Later pages use what Shop found (a product). */
function pages() {
  return [
    { id: 'home', label: 'Home', path: '/', ready: 'main a[href]' },
    {
      id: 'shop',
      label: 'Shop',
      path: '/shop',
      ready: 'main a[href^="/product/"]',
      readyWhy: 'No products show on Shop.',
      after: async (page) => {
        if (productPath) return;
        productPath = await page.locator('main a[href^="/product/"]').first().getAttribute('href');
      },
    },
    { id: 'category', label: 'Category (Rackets)', path: '/category/rackets', ready: 'main a[href]' },
    {
      id: 'product',
      label: 'Product',
      path: () => productPath?.split('?')[0] ?? null,
      skipWhy: 'Shop showed no product to open.',
      ready: 'main h1',
      readyWhy: 'The product name never showed.',
      after: async (page) => {
        if (productId) return;
        const product = await readProductSeed(page);
        if (!product) return;
        productId = product.id;
        productName = product.name ?? null;
        // A complete line: the first value of each option (a size, a colour).
        productSelection = Object.fromEntries(
          (product.options ?? [])
            .filter((option) => option?.key && option.values?.[0]?.id)
            .map((option) => [option.key, option.values[0].id]),
        );
      },
    },
    {
      id: 'search',
      label: 'Search',
      path: () => `/search?q=${encodeURIComponent(searchWord())}`,
      ready: 'main a[href^="/product/"]',
      readyWhy: 'Search found no products.',
    },
    {
      id: 'bag',
      label: 'Bag with one item',
      path: '/',
      skipWhy: 'No product id to put in the bag.',
      needs: () => Boolean(productId),
      seedBag: true,
      ready: null,
      action: openBag,
    },
    { id: 'login', label: 'Sign In', path: '/login', ready: 'input[type="email"]', readyWhy: 'The email field never showed.' },
  ];
}

/** First word of the product Shop showed, so Search should find at least that product. */
function searchWord() {
  const word = (productName ?? '').split(/\s+/).find((w) => /^[\p{L}\p{N}]{3,}$/u.test(w));
  return word ?? 'padel';
}

/** Opens one page at one size and returns what went wrong, if anything. */
async function check(context, size, def) {
  const path = typeof def.path === 'function' ? def.path() : def.path;
  const base = { page: def.id, label: def.label, size: size.id, sizeLabel: size.label, path, problems: [], notes: [] };
  if (!path || (def.needs && !def.needs())) {
    return { ...base, ok: false, skipped: true, problems: [def.skipWhy ?? 'Nothing to open.'] };
  }

  const page = await context.newPage();
  const problems = [];
  const notes = [];
  const sameOrigin = (url) => {
    try {
      return new URL(url).origin === ORIGIN;
    } catch {
      return false;
    }
  };

  page.on('pageerror', (error) => problems.push(`The page threw an error: ${oneLine(error.message)}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = oneLine(message.text());
    const url = message.location()?.url ?? '';
    if (/^Failed to load resource/i.test(text) && url && !sameOrigin(url)) {
      notes.push(`Outside file did not load: ${shortUrl(url)}`);
      return;
    }
    if (ALLOWED_CONSOLE.some((pattern) => pattern.test(text))) return;
    const hint = PERFORMANCE_HINTS.find((h) => h.pattern.test(text));
    if (hint) {
      notes.push(`${def.label}, ${size.label.toLowerCase()}: ${hint.note}`);
      return;
    }
    problems.push(`Console error: ${text}`);
  });
  page.on('requestfailed', (request) => {
    if (!sameOrigin(request.url())) return;
    const why = request.failure()?.errorText ?? '';
    // A navigation or a newer request cancels older ones; that is not a failure.
    if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(why)) return;
    problems.push(`Request to our server failed: ${shortUrl(request.url())} (${why})`);
  });
  page.on('response', (response) => {
    if (!sameOrigin(response.url()) || response.status() < 400) return;
    // The page's own document status is reported after goto().
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) return;
    problems.push(`Our server answered ${response.status()} for ${shortUrl(response.url())}`);
  });

  if (def.seedBag) {
    const line = { productId, variantId: null, selection: productSelection, quantity: 1 };
    await page.addInitScript(
      ([key, value]) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // Storage blocked: the bag check reports the missing line.
        }
      },
      [CART_KEY, JSON.stringify([line])],
    );
  }

  const started = Date.now();
  try {
    const response = await page.goto(BASE + path, { waitUntil: 'load', timeout: NAV_TIMEOUT });
    const status = response?.status() ?? 0;
    if (!response) problems.push('The page did not answer.');
    else if (status >= 400) problems.push(`The page answered ${status}.`);

    const wanted = new URL(BASE + path).pathname;
    const landed = new URL(page.url()).pathname;
    if (landed !== wanted) problems.push(`The page sent the visitor to ${landed} instead.`);

    await page.waitForTimeout(SETTLE_MS);
    await waitForStoreLoader(page, problems);

    if (def.ready) {
      try {
        await page.locator(def.ready).first().waitFor({ state: 'visible', timeout: READY_TIMEOUT });
      } catch {
        problems.push(def.readyWhy ?? `Nothing showed for "${def.ready}".`);
      }
    }
    if (def.action) await def.action(page, problems);

    const mainText = await page
      .locator('main')
      .first()
      .innerText({ timeout: 5_000 })
      .catch(() => '');
    if (mainText.trim().length < 20) problems.push('The main area is empty.');
    else if (BROKEN_PAGE_TEXT.test(mainText)) problems.push(`The page says: "${mainText.match(BROKEN_PAGE_TEXT)[0]}".`);

    if (def.after) await def.after(page).catch(() => undefined);
  } catch (error) {
    problems.push(`Could not open the page: ${oneLine(error.message)}`);
  }

  const screenshot = `${def.id}-${size.id}.png`;
  await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => undefined);
  await page.close();

  return {
    ...base,
    ok: problems.length === 0,
    skipped: false,
    problems: [...new Set(problems)],
    notes: [...new Set(notes)],
    screenshot,
    ms: Date.now() - started,
  };
}

/** The first-load store loader ("Loading store") must go away. */
async function waitForStoreLoader(page, problems) {
  const loader = page.locator('[role="status"][aria-label="Loading store"]');
  try {
    await loader.waitFor({ state: 'hidden', timeout: READY_TIMEOUT });
  } catch {
    problems.push('The store loader never went away.');
  }
}

/** Taps the visible bag button and expects the bag to open with its one line. */
async function openBag(page, problems) {
  const button = page.locator('button[aria-label="Shopping Cart"]:visible').first();
  try {
    await button.click({ timeout: 10_000 });
  } catch {
    problems.push('The bag button could not be pressed.');
    return;
  }
  try {
    await page.locator('app-cart-drawer .bag-line:visible').first().waitFor({ state: 'visible', timeout: READY_TIMEOUT });
  } catch {
    problems.push('The bag opened without the item in it.');
  }
  // Let the slide-in and the product reads settle, then look again: the line must still be
  // there and the empty-bag message must not show next to a count of 1.
  await page.waitForTimeout(2_500);
  const lineStillThere = await page.locator('app-cart-drawer .bag-line:visible').count();
  const emptyShown = await page.getByText('Your bag is empty').filter({ visible: true }).count();
  if (!lineStillThere || emptyShown) problems.push('The bag shows "Your bag is empty" although it has an item.');
}

/** The product the server rendered, from the TransferState seed (`product-page:<slug>`). */
async function readProductSeed(page) {
  return page.evaluate(() => {
    const raw = document.getElementById('ng-state')?.textContent;
    if (!raw) return null;
    try {
      const state = JSON.parse(raw);
      const key = Object.keys(state).find((k) => k.startsWith('product-page:'));
      const product = key ? state[key]?.product : null;
      return product?.id ? { id: product.id, name: product.name, options: product.options } : null;
    } catch {
      return null;
    }
  });
}

function summary() {
  const sha = process.env.HEAD_SHA ?? '';
  const runUrl = process.env.RUN_URL ?? '';
  const passed = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const lines = [];
  lines.push(failed.length ? `### 🖥 Browser Check · ${failed.length} failed` : '### 🖥 Browser Check · all pages passed');
  lines.push('');
  lines.push(
    `${passed} passed, ${failed.length} failed${skipped ? `, ${skipped} skipped` : ''}, on ${sha ? `\`${sha.slice(0, 7)}\`` : 'this commit'}. ` +
      'Phone is 390×844, desktop 1440×900, against dev data.',
  );
  lines.push('');
  lines.push('| Page | Phone | Desktop |');
  lines.push('| --- | --- | --- |');
  const byPage = new Map();
  for (const r of results) {
    if (!byPage.has(r.page)) byPage.set(r.page, { label: r.label, path: r.path });
    byPage.get(r.page)[r.size] = r;
  }
  const cell = (r) => (!r ? '–' : r.skipped ? '⏭ skipped' : r.ok ? (r.retried ? '✅ (2nd try)' : '✅') : '❌');
  for (const [, row] of byPage) {
    const where = row.path ? ` \`${row.path}\`` : '';
    lines.push(`| ${row.label}${where} | ${cell(row.phone)} | ${cell(row.desktop)} |`);
  }
  const problems = results.filter((r) => !r.ok);
  if (problems.length) {
    lines.push('');
    lines.push('**What went wrong**');
    for (const r of problems) {
      lines.push(`- ${r.label}, ${r.sizeLabel.toLowerCase()}: ${r.problems.join(' · ')}`);
    }
  }
  const notes = [...new Set(results.flatMap((r) => r.notes ?? []))];
  if (notes.length) {
    lines.push('');
    lines.push('<details><summary>Notes (do not fail the check)</summary>');
    lines.push('');
    for (const note of notes.slice(0, 15)) lines.push(`- ${note}`);
    if (notes.length > 15) lines.push(`- …and ${notes.length - 15} more`);
    lines.push('');
    lines.push('</details>');
  }
  lines.push('');
  lines.push(
    runUrl
      ? `Screenshots of every page and size: **[open the run](${runUrl})** and download the \`browser-check\` file under Artifacts.`
      : 'Screenshots are in the browser-check folder.',
  );
  return `${lines.join('\n')}\n`;
}

function oneLine(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 80 ? `${u.pathname.slice(0, 80)}…` : u.pathname;
    return u.origin === ORIGIN ? path : `${u.host}${path}`;
  } catch {
    return url.slice(0, 100);
  }
}
