/**
 * Copies code shared by Cloud Functions and the Angular app from `functions/src`
 * (the only copy to edit) into `src/app`. `--check` fails when a copy differs.
 *
 * - Pricing engine: functions/src/offers/engine → src/app/core/services/offers/engine
 * - Store info:     functions/src/store         → src/app/core/config
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const SHARED = [
  {
    label: 'Pricing engine',
    sourceDir: path.join(rootDir, 'functions', 'src', 'offers', 'engine'),
    targetDir: path.join(rootDir, 'src', 'app', 'core', 'services', 'offers', 'engine'),
    header: '// GENERATED — edit functions/src/offers/engine\n',
  },
  {
    label: 'Store info',
    sourceDir: path.join(rootDir, 'functions', 'src', 'store'),
    targetDir: path.join(rootDir, 'src', 'app', 'core', 'config'),
    header: '// GENERATED — edit functions/src/store\n',
  },
];

const isCheck = process.argv.includes('--check');

function transformContent(raw, header) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const rewrittenImports = normalized.replace(
    /(from\s+['"]\.\/[a-zA-Z0-9_-]+)\.js(['"])/g,
    '$1$2',
  );
  return `${header}${rewrittenImports}`;
}

function listTs(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .sort();
}

function checkOne({ label, sourceDir, targetDir, header }) {
  if (!fs.existsSync(targetDir)) {
    console.error(`${label} copy is missing. Run "npm run sync:engine".`);
    process.exit(1);
  }
  const sourceFiles = listTs(sourceDir);
  const targetFiles = listTs(targetDir);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
    console.error(`${label} file list is out of sync. Run "npm run sync:engine".`);
    process.exit(1);
  }
  for (const file of sourceFiles) {
    const expected = transformContent(fs.readFileSync(path.join(sourceDir, file), 'utf8'), header);
    const actual = fs.readFileSync(path.join(targetDir, file), 'utf8').replace(/\r\n/g, '\n');
    if (expected !== actual) {
      console.error(`${label} file "${file}" is out of sync. Run "npm run sync:engine".`);
      process.exit(1);
    }
  }
}

function writeOne({ sourceDir, targetDir, header }) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of listTs(sourceDir)) {
    const expected = transformContent(fs.readFileSync(path.join(sourceDir, file), 'utf8'), header);
    fs.writeFileSync(path.join(targetDir, file), expected, 'utf8');
  }
}

function main() {
  for (const entry of SHARED) {
    if (!fs.existsSync(entry.sourceDir)) {
      console.error(`${entry.label} source directory not found: ${entry.sourceDir}`);
      process.exit(1);
    }
    if (isCheck) checkOne(entry);
    else writeOne(entry);
  }
}

main();
