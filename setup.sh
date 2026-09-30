#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting Environment Setup for Jules..."

# 1. Install root dependencies
echo "📦 Installing root dependencies..."
npm ci

# 2. Install functions dependencies
if [ -d "functions" ]; then
  echo "📦 Installing functions dependencies..."
  cd functions
  npm ci
  cd ..
fi

# 3. Verify Angular CLI availability
echo "🛠️ Checking Angular CLI..."
npx ng version

# 4. Verify Build Configuration (Dry Run)
echo "🏗️ Verifying build configurations..."
npx ng build --configuration=development --progress=false

# 5. Skip Tests (As requested: Jules ignores testing)
echo "⏩ Skipping tests for snapshot..."


echo "✅ Setup complete! Environment is ready for snapshot."
# Check for forbidden 3rd party testing libs that Jules keeps trying to add
if grep -E "@analogjs/vite-plugin-angular|vite-tsconfig-paths" package.json; then
  echo "❌ CRITICAL ERROR: Jules, you have added forbidden 3rd-party libraries."
  echo "Angular 22 handles Vitest NATIVELY via @angular/build:unit-test. Remove these from package.json immediately."
  exit 1
fi
