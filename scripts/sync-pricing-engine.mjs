import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'functions', 'src', 'offers', 'engine');
const targetDir = path.join(rootDir, 'src', 'app', 'core', 'services', 'offers', 'engine');

const HEADER = '// GENERATED — edit functions/src/offers/engine\n';
const isCheck = process.argv.includes('--check');

function transformEngineContent(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const rewrittenImports = normalized.replace(
    /(from\s+['"]\.\/[a-zA-Z0-9_-]+)\.js(['"])/g,
    '$1$2',
  );
  return `${HEADER}${rewrittenImports}`;
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source engine directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const sourceFiles = fs
    .readdirSync(sourceDir)
    .filter((file) => file.endsWith('.ts'))
    .sort();

  if (isCheck) {
    if (!fs.existsSync(targetDir)) {
      console.error('Pricing engine target directory is missing. Run "npm run sync:engine".');
      process.exit(1);
    }

    const targetFiles = fs
      .readdirSync(targetDir)
      .filter((file) => file.endsWith('.ts'))
      .sort();

    if (JSON.stringify(sourceFiles) !== JSON.stringify(targetFiles)) {
      console.error('Pricing engine file list is out of sync. Run "npm run sync:engine".');
      process.exit(1);
    }

    for (const file of sourceFiles) {
      const srcContent = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      const expected = transformEngineContent(srcContent);
      const actual = fs
        .readFileSync(path.join(targetDir, file), 'utf8')
        .replace(/\r\n/g, '\n');
      if (expected !== actual) {
        console.error(
          `Pricing engine file "${file}" is out of sync. Run "npm run sync:engine".`,
        );
        process.exit(1);
      }
    }
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of sourceFiles) {
    const srcContent = fs.readFileSync(path.join(sourceDir, file), 'utf8');
    const expected = transformEngineContent(srcContent);
    fs.writeFileSync(path.join(targetDir, file), expected, 'utf8');
  }
}

main();
