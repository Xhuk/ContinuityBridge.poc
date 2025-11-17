#!/bin/bash

# Publish Qoder Wiki to GitHub
# 
# This script exports Qoder wiki and pushes to GitHub wiki repository
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
  git branch -M master
fi

# Step 4: Add remote if needed
if ! git remote | grep -q "origin"; then
  echo "🔗 Step 3: Adding GitHub remote..."
  git remote add origin https://github.com/Xhuk/ContinuityBridge.wiki.git
fi

# Step 5: Commit changes
echo "💾 Step 4: Committing changes..."
git add .
git commit -m "Update wiki from Qoder - $(date '+%Y-%m-%d %H:%M:%S')" || echo "No changes to commit"

# Step 6: Push to GitHub
echo "🚀 Step 5: Pushing to GitHub..."
git push -u origin master --force

echo ""
echo "✅ Wiki published successfully!"
echo "📖 View at: https://github.com/Xhuk/ContinuityBridge/wiki"
