/**
 * Atteya Store Pre-Flight Check & Quality Gate
 *
 * Scans workspace for:
 * 1. Material M3 Component Styling (Zero Tailwind on Material components)
 * 2. Tailwind Syntax & Token Violations (Prefix !, raw colors, w-N h-N)
 * 3. Accessibility Guardrails (Fake buttons, invalid roles, missing aria-label)
 * 4. Dangerous ReDoS Regex Patterns
 * 5. SSR Server Routes Coverage (app.routes.server.ts)
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');
let totalErrors = 0;
let totalWarnings = 0;

function logError(file, line, msg) {
  totalErrors++;
  const relPath = path.relative(process.cwd(), file);
  console.error(`\x1b[31m[ERROR]\x1b[0m ${relPath}:${line} - ${msg}`);
}

function logWarning(file, line, msg) {
  totalWarnings++;
  const relPath = path.relative(process.cwd(), file);
  console.warn(`\x1b[33m[WARN]\x1b[0m ${relPath}:${line} - ${msg}`);
}

/** Recursively collect all files matching extensions */
function getFiles(dir, extensions = ['.html', '.ts']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.angular' || file === 'dist') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, extensions));
    } else if (extensions.some((ext) => file.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function getLineNumberFromOffset(text, offset, baseLine = 1) {
  return baseLine + text.slice(0, offset).split('\n').length - 1;
}

// -------------------------------------------------------------
// 1. Check HTML Templates & Inline Templates
// -------------------------------------------------------------
function auditTemplateContent(filePath, templateContent, baseLine = 1) {
  // A. Tag-level audit (supports multi-line tags)
  const tagRegex = /<([a-zA-Z0-9-]+)(?:[^>"']|"[^"]*"|'[^']*')*>/gs;
  let tagMatch;

  while ((tagMatch = tagRegex.exec(templateContent)) !== null) {
    const fullTag = tagMatch[0];
    const tagName = tagMatch[1].toLowerCase();
    const tagLine = getLineNumberFromOffset(templateContent, tagMatch.index, baseLine);

    // Collect all class strings and bound classes on the tag
    const classAttrMatches = [
      ...fullTag.matchAll(/\b(?:\[?class\]?|\[ngClass\])\s*=\s*["']([^"']+)["']/gi),
    ];
    const boundClassMatches = [
      ...fullTag.matchAll(/\[class\.([^\]]+)\]/gi),
    ];
    const allClassStrings = [
      ...classAttrMatches.map((m) => m[1]),
      ...boundClassMatches.map((m) => m[1]),
    ];

    // Check class attributes
    for (const classStr of allClassStrings) {
      if (/(?:^|\s)!([a-zA-Z0-9_-]+)/.test(classStr)) {
        logError(
          filePath,
          tagLine,
          `Tailwind v4 prefix '!' detected in class string: "${classStr}". Use suffix '!' (e.g. 'hidden!' instead of '!hidden').`
        );
      }

      // Rule: Ban on redundant text-on-surface (except in playground token catalog)
      if (!filePath.includes('playground') && /(?:^|\s)text-on-surface(?!\S)/.test(classStr)) {
        logError(
          filePath,
          tagLine,
          `Redundant 'text-on-surface' class detected: "${classStr}". Text color is inherited from body by default; do not apply text-on-surface.`
        );
      }

      // Rule: Enforce font-bold! with suffix '!' (except in playground token catalog)
      if (!filePath.includes('playground') && /(?:^|\s)font-bold(?![!a-zA-Z0-9_-])/.test(classStr)) {
        logError(
          filePath,
          tagLine,
          `Un-postfixed 'font-bold' detected in class string: "${classStr}". Always use 'font-bold!' with suffix '!' to override M3 font shorthand.`
        );
      }

      // Rule: Prefer elements-center, elements-start, elements-end, elements-between shortcuts
      const classWords = classStr.split(/\s+/);
      if (classWords.includes('flex') && classWords.includes('items-center')) {
        for (const [justCls, shortcut] of [
          ['justify-center', 'elements-center'],
          ['justify-start', 'elements-start'],
          ['justify-end', 'elements-end'],
          ['justify-between', 'elements-between'],
        ]) {
          if (classWords.includes(justCls)) {
            logError(
              filePath,
              tagLine,
              `Verbose flex alignment detected: 'flex items-center ${justCls}' in "${classStr}". Use '${shortcut}' shortcut instead.`
            );
          }
        }
      }
    }

    // Rule: Zero Tailwind on Material Components
    // Check for <button ...> or <a ...> with matButton/matIconButton/matFab/matMiniFab and hyphenated variants
    const isMatButton =
      /\b(matButton|matIconButton|matFab|matMiniFab|mat-button|mat-icon-button|mat-fab|mat-mini-fab|mat-stroked-button|mat-flat-button|mat-raised-button)\b/i.test(
        fullTag
      );

    if ((tagName === 'button' || tagName === 'a') && isMatButton) {
      for (const classes of allClassStrings) {
        // Forbid styling (color, bg, border, hover, text, p-) and layout styling (flex, items-, justify-, gap-, w-, h-, size-, grid)
        if (
          /\b(bg-|text-|hover:|border-|shadow-|rounded-|p-|px-|py-|gap-|items-|justify-)|(\b(flex|inline-flex|w-|h-|size-|grid)\b)/.test(
            classes
          )
        ) {
          logError(
            filePath,
            tagLine,
            `Tailwind styling or layout applied to Angular Material button: "${classes}". Material components must only be styled via M3 tokens or native inputs.`
          );
        }
      }
    }

    // Check <mat-icon class="..."> and [class.*]
    if (tagName === 'mat-icon') {
      for (const classes of allClassStrings) {
        if (/\b(text-|bg-|size-|w-|h-|scale-)/.test(classes)) {
          logError(
            filePath,
            tagLine,
            `Styling class applied to <mat-icon>: "${classes}". Use [iconColor]="..." and [size]="..." inputs instead.`
          );
        }
      }
    }

    // Check <mat-menu>, <mat-drawer>, <mat-sidenav> (excluding container/content)
    if (/^(mat-menu|mat-drawer|mat-sidenav)$/i.test(tagName)) {
      if (allClassStrings.length > 0) {
        logError(
          filePath,
          tagLine,
          `Tailwind class applied directly to Material container <${tagName}>. Wrap in a native element or use M3 override tokens.`
        );
      }
    }

    // Rule: Fake buttons (div/span/a role="button")
    if (/^(div|span|a)$/i.test(tagName) && /\brole=["']button["']/i.test(fullTag)) {
      logError(
        filePath,
        tagLine,
        `Fake button detected: <${tagName} role="button">. Always use native accessible <button type="button">.`
      );
    }

    // Rule: Invalid ARIA roles
    if (/\brole=["']none["']/i.test(fullTag)) {
      logError(
        filePath,
        tagLine,
        `Invalid/abstract role="none" detected. Remove role or use semantic HTML.`
      );
    }
    if (/^(nav|ul|ol|li)$/i.test(tagName) && /\brole=["'](menu|menubar|menuitem)["']/i.test(fullTag)) {
      const roleName = new RegExp(/\brole=["'](menu|menubar|menuitem)["']/i).exec(fullTag)?.[1];
      logWarning(
        filePath,
        tagLine,
        `Avoid assigning role="${roleName}" to standard web navigation. Screen readers announce menus as desktop app application menus.`
      );
    }
    if (tagName === 'div' && /\brole=["']region["']/i.test(fullTag)) {
      logWarning(filePath, tagLine, `Use semantic <section> instead of <div role="region">.`);
    }

    // Rule: Missing aria-label on icon buttons
    if (/\b(matIconButton|mat-icon-button)\b/i.test(fullTag)) {
      const hasAriaLabel =
        /\baria-label=["']/i.test(fullTag) ||
        /\[attr\.aria-label\]=["']/i.test(fullTag) ||
        /\[aria-label\]=["']/i.test(fullTag) ||
        /\baria-labelledby=["']/i.test(fullTag) ||
        /\[attr\.aria-labelledby\]=["']/i.test(fullTag) ||
        /\[aria-labelledby\]=["']/i.test(fullTag);
      if (!hasAriaLabel) {
        logError(
          filePath,
          tagLine,
          `<${tagName} matIconButton> missing required aria-label or aria-labelledby attribute.`
        );
      }
    }
  }

  // B. Line-level audit inside template
  const lines = templateContent.split('\n');
  lines.forEach((lineText, index) => {
    const lineNum = baseLine + index;

    // Rule: Prefix ! in class attributes or @apply
    const classOrApplyMatch = lineText.match(/(?:class=["']|@apply\s+)([^"';\n]+)/i);
    if (classOrApplyMatch && /(?:^|\s)!([a-zA-Z0-9_-]+)/.test(classOrApplyMatch[1])) {
      logError(
        filePath,
        lineNum,
        `Tailwind v4 prefix '!' detected. In this project and Tailwind v4, use suffix '!' (e.g., 'hidden!' instead of '!hidden').`
      );
    }

    // Rule: Equal width and height (w-X h-X) -> should be size-X
    const sizeMatch = lineText.match(/\bw-([\d.]+)\b.*?\bh-([\d.]+)\b|\bh-([\d.]+)\b.*?\bw-([\d.]+)\b/);
    if (sizeMatch) {
      const val1 = sizeMatch[1] || sizeMatch[3];
      const val2 = sizeMatch[2] || sizeMatch[4];
      if (val1 === val2) {
        logWarning(filePath, lineNum, `Found 'w-${val1} h-${val2}'. Use 'size-${val1}' instead.`);
      }
    }

    // Rule: Banned generic palette colors (e.g. bg-red-500, bg-emerald-600)
    if (
      /\b(?:hover:)?(bg|text|border|ring)-(red|emerald|amber|green|blue|slate|zinc|gray)-(?:[1-9]00)\b/.test(
        lineText
      )
    ) {
      logError(
        filePath,
        lineNum,
        `Raw palette color detected. Use semantic tokens ('bg-primary', 'text-on-surface', 'bg-success', 'theme="warning"') instead.`
      );
    }
  });
}

function auditTemplates(htmlFiles, tsFiles) {
  // Audit standalone HTML templates
  for (const filePath of htmlFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    auditTemplateContent(filePath, content, 1);
  }

  // Audit inline templates in TS files
  const inlineTemplateRegex = /template:\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/g;
  for (const filePath of tsFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;
    while ((match = inlineTemplateRegex.exec(content)) !== null) {
      const rawTemplate = match[1];
      const templateContent = rawTemplate.slice(1, -1);
      const quoteChar = rawTemplate[0];
      const charOffset = match.index + match[0].indexOf(quoteChar) + 1;
      const baseLine = getLineNumberFromOffset(content, charOffset, 1);
      auditTemplateContent(filePath, templateContent, baseLine);
    }
  }
}

// -------------------------------------------------------------
// 2. Check TypeScript Files (ReDoS, Standalone, Injectable)
// -------------------------------------------------------------
function auditTypeScript(files) {
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((lineText, index) => {
      const lineNum = index + 1;
      const trimmed = lineText.trim();

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return;
      }

      // ReDoS: Check for unbounded quantifiers with anchors or repetitions
      // Examples: (a+)+, (\w+)*, ^-+|-+$, ^[\w-]+.+|.+[\w-]+$
      const hasNestedQuantifier = /\([^)]*[+*][^)]*\)[+*]/.test(lineText);
      const hasUnboundedAnchoredAlternation = /(?:\^(?:\[[^\]]+\]|[^|/])+?[+*].*\||\|.*?(?:\[[^\]]+\]|[^|/])+?[+*]\$)/.test(
        lineText
      );
      if (hasNestedQuantifier || hasUnboundedAnchoredAlternation) {
        logError(
          filePath,
          lineNum,
          `Potential ReDoS polynomial backtracking in regex. Prefer native string methods (startsWith/endsWith/slice) or bounded quantifiers.`
        );
      }

      // Deprecated Standalone flag in Angular v22
      if (/standalone:\s*true/.test(lineText)) {
        logWarning(filePath, lineNum, `'standalone: true' is redundant in Angular v22+. Standalone is default.`);
      }

      // Legacy Injectable
      if (/@Injectable\(\s*\{\s*providedIn:\s*['"]root['"]\s*\}\s*\)/.test(lineText)) {
        logError(
          filePath,
          lineNum,
          `Legacy @Injectable({ providedIn: 'root' }) found. In Angular v22+, use @Service() from '@angular/core'.`
        );
      }
    });
  }
}

// -------------------------------------------------------------
// 3. Check SSR Routes Coverage
// -------------------------------------------------------------
function auditSSRRoutes() {
  const serverRoutesPath = path.join(SRC_DIR, 'app', 'app.routes.server.ts');
  if (!fs.existsSync(serverRoutesPath)) return;

  const serverRoutesContent = fs.readFileSync(serverRoutesPath, 'utf-8');

  // Find all route files: app.routes.ts and any feature routes (**/*.routes.ts)
  const allRouteFiles = getFiles(path.join(SRC_DIR, 'app'), ['.routes.ts'])
    .filter((file) => !file.endsWith('.routes.server.ts'));

  for (const routeFilePath of allRouteFiles) {
    const routesContent = fs.readFileSync(routeFilePath, 'utf-8');
    const paramPathRegex = /path:\s*['"`]([^'"`]*(?::|\*\*)[^'"`]*)['"`]/g;
    let match;

    while ((match = paramPathRegex.exec(routesContent)) !== null) {
      const dynamicPath = match[1];

      // Exact match check
      if (serverRoutesContent.includes(`'${dynamicPath}'`) || serverRoutesContent.includes(`"${dynamicPath}"`)) {
        continue;
      }

      // Wildcard prefix check (e.g. 'category/**' covers 'category/:slug')
      const normalizedPath = dynamicPath.replace(/^\//, '');
      const prefix = normalizedPath.split('/')[0];
      if (prefix && (serverRoutesContent.includes(`'${prefix}/**'`) || serverRoutesContent.includes(`"${prefix}/**"`))) {
        continue;
      }

      // Feature directory wildcard check (e.g., if inside features/admin/, admin/** covers it)
      const relToFeatures = path.relative(path.join(SRC_DIR, 'app', 'features'), routeFilePath);
      if (!relToFeatures.startsWith('..')) {
        const featureDir = relToFeatures.split(path.sep)[0];
        if (serverRoutesContent.includes(`'${featureDir}/**'`) || serverRoutesContent.includes(`"${featureDir}/**"`)) {
          continue;
        }
      }

      logError(
        serverRoutesPath,
        1,
        `Parameterized route '${dynamicPath}' in ${path.relative(process.cwd(), routeFilePath)} is NOT covered in app.routes.server.ts. Dynamic routes require RenderMode.Server to prevent build failures.`
      );
    }
  }
}

// -------------------------------------------------------------
// Main Runner
// -------------------------------------------------------------
console.log('\x1b[36m🚀 Starting Pre-Flight Quality Check...\x1b[0m\n');

const templateFiles = getFiles(SRC_DIR, ['.html']);
const tsFiles = getFiles(SRC_DIR, ['.ts']);

auditTemplates(templateFiles, tsFiles);
auditTypeScript(tsFiles);
auditSSRRoutes();

console.log('\n----------------------------------------');
if (totalErrors === 0 && totalWarnings === 0) {
  console.log('\x1b[32m✅ Pre-Flight Check PASSED: 0 errors, 0 warnings.\x1b[0m');
  process.exit(0);
} else if (totalErrors === 0) {
  console.log(`\x1b[33m⚠️ Pre-Flight Check PASSED with ${totalWarnings} warning(s).\x1b[0m`);
  process.exit(0);
} else {
  console.error(`\x1b[31m❌ Pre-Flight Check FAILED: ${totalErrors} error(s), ${totalWarnings} warning(s).\x1b[0m`);
  process.exit(1);
}
