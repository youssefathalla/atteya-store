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

echo "✅ Setup complete! Environment is ready for snapshot."
