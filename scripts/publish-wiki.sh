#!/bin/bash

# Publish Qoder Wiki to GitHub
# 
# This script exports Qoder wiki and pushes to GitHub wiki repository
# Note: Pushes to 'wiki-export' branch to avoid triggering Render deployment
# Usage: npm run wiki:publish

set -e

echo "📚 Publishing Qoder Wiki to GitHub..."
echo ""

# Step 1: Export wiki
echo "🔄 Step 1: Exporting wiki from Qoder..."
npm run wiki:export

# Step 2: Navigate to wiki directory
cd wiki

# Step 3: Initialize git if needed
if [ ! -d ".git" ]; then
  echo "🔧 Step 2: Initializing git repository..."
  git init
  git branch -M wiki-export
fi

# Step 4: Add remote if needed
if ! git remote | grep -q "origin"; then
  echo "🔗 Step 3: Adding GitHub remote..."
  git remote add origin https://github.com/Xhuk/ContinuityBridge.poc
fi

# Step 5: Commit changes
echo "💾 Step 4: Committing changes..."
git add .
git commit -m "docs: update wiki from Qoder - $(date '+%Y-%m-%d %H:%M:%S')" || echo "No changes to commit"

# Step 6: Push to GitHub (wiki-export branch - won't trigger Render)
echo "🚀 Step 5: Pushing to GitHub (wiki-export branch)..."
git push -u origin wiki-export --force

echo ""
echo "✅ Wiki published successfully!"
echo "📖 Branch: wiki-export (won't trigger Render deployment)"
echo "🔗 View at: https://github.com/Xhuk/ContinuityBridge/tree/wiki-export/wiki"
