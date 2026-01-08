#!/bin/bash

# bcp: Build, Commit, Update PRD, and Push
# This script automates the workflow of building, checking PRD, committing, and pushing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🔨 Step 1: Building project..."
npm run build

echo ""
echo "📋 Step 2: Checking git status..."
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ No changes to commit"
    exit 0
fi

echo ""
echo "📝 Step 3: Checking if PRD needs updating..."
if npm run check-prd > /dev/null 2>&1; then
    echo "✅ PRD is up to date"
    PRD_NEEDS_UPDATE=false
else
    echo "⚠️  PRD may need updating"
    PRD_NEEDS_UPDATE=true
fi

echo ""
echo "📦 Step 4: Staging all changes..."
git add -A

echo ""
if [ "$PRD_NEEDS_UPDATE" = true ]; then
    echo "⚠️  Warning: Code changes detected that may require PRD updates"
    echo "   Consider updating docs/PRD-Retroactive.md before committing"
    echo ""
    read -p "Continue with commit anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Commit cancelled"
        exit 1
    fi
fi

echo ""
echo "💾 Step 5: Committing changes..."
if [ -z "$1" ]; then
    echo "   No commit message provided. Using default..."
    git commit -m "chore: update codebase"
else
    git commit -m "$1"
fi

echo ""
echo "🚀 Step 6: Pushing to remote..."
git push

echo ""
echo "✅ Done! Build, commit, and push completed successfully."
