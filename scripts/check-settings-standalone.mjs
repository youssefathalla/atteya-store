/**
 * AS-31: Settings sections must be standalone pages.
 *
 * Fails when an in-page switcher reimplements the admin Settings sidebar
 * (Admins / Shipping / Outside Egypt). Bank transfer was removed with Paymob checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_DIR = path.join(ROOT, 'src/app/features/admin/pages/settings');
const ROUTES_FILE = path.join(ROOT, 'src/app/features/admin/admin.routes.ts');
const NAV_FILE = path.join(ROOT, 'src/app/features/admin/layout/admin-nav.data.ts');

const SECTIONS = [
  { id: 'admins', path: '/admin/settings/admins', loadHint: 'admins/admins-tab.component' },
  {
    id: 'shipping',
    path: '/admin/settings/shipping',
    loadHint: 'shipping/shipping-tab.component',
  },
  {
    id: 'international',
    path: '/admin/settings/international',
    loadHint: 'international/international-tab.component',
  },
];

const CROSS_SECTION_LINK =
  /routerLink\s*=\s*["'](?:\.?\.?\/)?(?:admins|shipping|international)["']|routerLink\s*=\s*["']\/admin\/settings\/(?:admins|shipping|international)["']|\[routerLink\]\s*=\s*["'][^"']*\/admin\/settings\/(?:admins|shipping|international)/;

let errors = 0;

function fail(message) {
  errors += 1;
  console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${path.relative(ROOT, filePath)}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function collectHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectHtmlFiles(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// 1. No shared shell that switches between Settings sections.
const shellHtml = path.join(SETTINGS_DIR, 'settings.component.html');
const shellTs = path.join(SETTINGS_DIR, 'settings.component.ts');
if (fs.existsSync(shellHtml) || fs.existsSync(shellTs)) {
  const shellText = [shellHtml, shellTs]
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n');
  const linkedSections = SECTIONS.filter(
    (section) =>
      shellText.includes(`routerLink="${section.id}"`) ||
      shellText.includes(`routerLink='${section.id}'`) ||
      shellText.includes(section.path),
  );
  if (linkedSections.length >= 2) {
    fail(
      'settings.component still links multiple Settings sections in-page. Remove the switcher; use the admin sidebar only.',
    );
  }
}

// 2. Each section template must not link to sibling Settings sections.
for (const htmlPath of collectHtmlFiles(SETTINGS_DIR)) {
  const text = fs.readFileSync(htmlPath, 'utf8');
  if (CROSS_SECTION_LINK.test(text)) {
    fail(
      `${path.relative(ROOT, htmlPath)} links to another Settings section. Each route must show only its own content.`,
    );
  }
}

// 3. Routes: componentless settings parent + one loadComponent per section.
const routes = read(ROUTES_FILE);
if (/pages\/settings\/settings\.component/.test(routes)) {
  fail(
    'admin.routes.ts still loads SettingsComponent as a shared shell. Use a componentless settings parent with standalone children.',
  );
}
for (const section of SECTIONS) {
  if (!routes.includes(`path: '${section.id}'`)) {
    fail(`admin.routes.ts is missing path '${section.id}' under settings.`);
  }
  if (!routes.includes(section.loadHint)) {
    fail(`admin.routes.ts does not load ${section.loadHint} for '${section.id}'.`);
  }
}

// 4. Sidebar lists every Settings section (source of truth for navigation).
const nav = read(NAV_FILE);
for (const section of SECTIONS) {
  if (!nav.includes(`path: '${section.path}'`)) {
    fail(`admin-nav.data.ts is missing Settings sidebar entry for ${section.path}.`);
  }
}

if (errors > 0) {
  console.error(`\x1b[31m❌ Settings standalone check failed: ${errors} error(s).\x1b[0m`);
  process.exit(1);
}

console.log('\x1b[32m✅ Settings sections are standalone (no in-page switcher).\x1b[0m');
