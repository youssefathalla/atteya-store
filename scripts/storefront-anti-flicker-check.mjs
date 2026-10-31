/**
 * Storefront anti-flicker contract checks (nav visibility, catalog seeds, category empty states).
 * Used by preflight and runnable as `node scripts/storefront-anti-flicker-check.mjs`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep in sync with LoaderHeight in src/app/shared/ui/loader/loader.model.ts */
const LOADER_HEIGHTS = new Set([
  '10',
  '20',
  '30',
  '40',
  '50',
  '60',
  '70',
  '80',
  '90',
  'full',
  'parent',
]);

/**
 * @param {string} html
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkAppLoaderMinHeights(html, fileLabel = 'template') {
  const tags = [...html.matchAll(/<app-loader\b[^>]*>/gi)];
  for (const match of tags) {
    const tag = match[0];
    const staticMatch = tag.match(/\bminHeight\s*=\s*["']([^"']+)["']/i);
    const boundMatch = tag.match(/\[minHeight\]\s*=\s*["']([^"']+)["']/i);
    const value = staticMatch?.[1] ?? boundMatch?.[1];
    if (!value) continue;
    if (value.includes('{{') || value.includes('(')) continue;
    if (!LOADER_HEIGHTS.has(value)) {
      return {
        ok: false,
        reason: `${fileLabel}: app-loader minHeight="${value}" is invalid. Use LoaderHeight: ${[...LOADER_HEIGHTS].join(', ')}.`,
      };
    }
  }
  return { ok: true };
}

/**
 * @param {string} ts category.component.ts source
 */
export function checkCategoryListingAntiFlicker(ts, html) {
  if (!ts.includes('catalogListCount')) {
    return {
      ok: false,
      reason: 'CategoryComponent must define catalogListCount so empty categories skip card skeletons.',
    };
  }
  if (!/catalogListCount\(\)\s*===\s*0/.test(ts)) {
    return {
      ok: false,
      reason: 'CategoryComponent showEmpty/isLoading must treat catalogListCount() === 0 as settled empty.',
    };
  }
  if (/\[loading\]\s*=\s*["']isLoading\(\)["']/.test(html)) {
    return {
      ok: false,
      reason:
        'Do not pass [loading]="isLoading()" to app-catalog-product-grid (card skeleton flash before empty). Use page loader + showEmpty first.',
    };
  }
  if (!html.includes('showEmpty()') || !html.includes('isLoading()')) {
    return {
      ok: false,
      reason: 'Category template must branch showEmpty() before isLoading() / product grid.',
    };
  }
  const emptyIdx = html.indexOf('showEmpty()');
  const gridIdx = html.indexOf('app-catalog-product-grid');
  if (emptyIdx < 0 || gridIdx < 0 || emptyIdx > gridIdx) {
    return {
      ok: false,
      reason: 'Category template must render showEmpty() before app-catalog-product-grid.',
    };
  }
  return { ok: true };
}

/**
 * @param {string} navTs
 * @param {string} routesTs
 * @param {string} catalogTs
 */
export function checkNavCatalogShellContract(navTs, routesTs, catalogTs) {
  if (!navTs.includes('#catalog.shellReady()')) {
    return {
      ok: false,
      reason: 'NavService.navLinksReady must wait on CatalogService.shellReady() before trimming nav.',
    };
  }
  if (!routesTs.includes('catalogSettingsResolver')) {
    return {
      ok: false,
      reason: 'Main layout resolve must include catalogSettingsResolver (SSR catalog counts seed).',
    };
  }
  if (!catalogTs.includes('CATALOG_SETTINGS_KEY')) {
    return {
      ok: false,
      reason: 'CatalogService must hydrate settings/catalog from TransferState before onSnapshot.',
    };
  }
  if (!catalogTs.includes('shellReady')) {
    return {
      ok: false,
      reason: 'CatalogService must expose shellReady for nav and listing gates.',
    };
  }
  return { ok: true };
}

export function assertStorefrontAntiFlicker(cwd = process.cwd()) {
  const src = path.resolve(cwd, 'src');
  const templateFiles = collectFiles(src, ['.html']);
  const tsFiles = collectFiles(src, ['.ts']);

  for (const filePath of templateFiles) {
    if (filePath.includes(`${path.sep}playground${path.sep}`)) continue;
    const html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('<app-loader')) continue;
    const rel = path.relative(cwd, filePath);
    const result = checkAppLoaderMinHeights(html, rel);
    if (!result.ok) throw new Error(result.reason);
  }

  for (const filePath of tsFiles) {
    if (filePath.includes(`${path.sep}playground${path.sep}`)) continue;
    const ts = fs.readFileSync(filePath, 'utf8');
    if (!ts.includes('template:') && !ts.includes('templateUrl:')) continue;
    if (!ts.includes('app-loader')) continue;
    const inline = ts.match(/template:\s*`([\s\S]*?)`/);
    if (!inline) continue;
    const rel = path.relative(cwd, filePath);
    const result = checkAppLoaderMinHeights(inline[1], rel);
    if (!result.ok) throw new Error(result.reason);
  }

  const categoryHtml = fs.readFileSync(
    path.resolve(src, 'app/features/category/category.component.html'),
    'utf8',
  );
  const categoryTs = fs.readFileSync(
    path.resolve(src, 'app/features/category/category.component.ts'),
    'utf8',
  );
  const categoryResult = checkCategoryListingAntiFlicker(categoryTs, categoryHtml);
  if (!categoryResult.ok) throw new Error(categoryResult.reason);

  const navTs = fs.readFileSync(
    path.resolve(src, 'app/core/services/navigation/nav.service.ts'),
    'utf8',
  );
  const routesTs = fs.readFileSync(path.resolve(src, 'app/app.routes.ts'), 'utf8');
  const catalogTs = fs.readFileSync(
    path.resolve(src, 'app/core/services/products/catalog.service.ts'),
    'utf8',
  );
  const shellResult = checkNavCatalogShellContract(navTs, routesTs, catalogTs);
  if (!shellResult.ok) throw new Error(shellResult.reason);

  const desktopNavHtml = fs.readFileSync(
    path.resolve(src, 'app/layout/navbar/desktop-nav/desktop-nav.component.html'),
    'utf8',
  );
  if (!desktopNavHtml.includes('showNavSkeleton()')) {
    throw new Error('Desktop nav must gate links with showNavSkeleton() until navLinksReady().');
  }
}

function collectFiles(dir, extensions) {
  /** @type {string[]} */
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.angular' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results.push(...collectFiles(full, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) results.push(full);
  }
  return results;
}

const isDirectRun =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  try {
    assertStorefrontAntiFlicker();
    console.log('[storefront-anti-flicker] ok: nav/catalog seeds and category empty-state contract.');
  } catch (error) {
    console.error(`[storefront-anti-flicker] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
