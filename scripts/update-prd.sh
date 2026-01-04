#!/bin/bash

# Script to update the PRD based on current codebase
# This script can be run manually or triggered by git hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PRD_PATH="$PROJECT_ROOT/docs/PRD-Retroactive.md"

echo "📝 Updating PRD from codebase..."
echo "   PRD Location: $PRD_PATH"
echo ""

# Check if PRD exists
if [ ! -f "$PRD_PATH" ]; then
    echo "❌ PRD file not found at $PRD_PATH"
    exit 1
fi

# Get the last commit hash that updated the PRD
LAST_PRD_UPDATE=$(git log -1 --format="%H" -- "$PRD_PATH" 2>/dev/null || echo "")

# Get list of changed files in the last commit (if any)
if [ -n "$LAST_PRD_UPDATE" ]; then
    CHANGED_FILES=$(git diff --name-only "$LAST_PRD_UPDATE" HEAD -- \
        ':!docs/PRD-Retroactive.md' \
        ':!*.md' \
        'src/' \
        'supabase/migrations/' \
        'package.json' \
        'next.config.mjs' \
        2>/dev/null || echo "")
else
    # If PRD was never committed, check all files
    CHANGED_FILES=$(git ls-files -- \
        'src/' \
        'supabase/migrations/' \
        'package.json' \
        'next.config.mjs' \
        2>/dev/null || echo "")
fi

# Check if there are code changes that might affect the PRD
if [ -z "$CHANGED_FILES" ]; then
    echo "✅ No code changes detected since last PRD update"
    echo "   PRD is up to date"
    exit 0
fi

echo "⚠️  Code changes detected that may require PRD updates:"
echo ""
echo "$CHANGED_FILES" | head -10 | sed 's/^/   - /'
if [ $(echo "$CHANGED_FILES" | wc -l) -gt 10 ]; then
    echo "   ... and $(($(echo "$CHANGED_FILES" | wc -l) - 10)) more files"
fi
echo ""

# Check if we're in a CI environment or if auto-update is enabled
if [ "$AUTO_UPDATE_PRD" = "true" ] || [ -n "$CI" ]; then
    echo "🔄 Auto-update enabled. Regenerating PRD..."
    echo ""
    echo "⚠️  Note: This requires AI assistance to properly analyze code changes."
    echo "   Please review the updated PRD and commit it separately."
    echo ""
    # In CI or auto-update mode, we'll just flag that update is needed
    # The actual update would need to be done via AI/Cursor
    exit 1
else
    echo "📋 PRD update reminder:"
    echo ""
    echo "   The following code changes may require PRD updates:"
    echo "   - New features or components"
    echo "   - Database schema changes"
    echo "   - API endpoint changes"
    echo "   - Integration changes"
    echo ""
    echo "   To update the PRD:"
    echo "   1. Review the changes above"
    echo "   2. Ask Cursor AI to update the PRD based on these changes"
    echo "   3. Or run: npm run update-prd"
    echo ""
    echo "   To skip this check: git commit --no-verify"
    echo ""
    exit 1
fi

