# PRD Update Process

## Overview

This document describes the automated process for keeping the Product Requirements Document (PRD) up-to-date with code changes.

## Automatic PRD Update Check

A git pre-commit hook automatically checks if code changes require PRD updates. The hook runs before every commit and will:

1. **Detect code changes** in source files (`.ts`, `.tsx`, `.js`, `.jsx`, `.sql`, etc.)
2. **Check if PRD was updated** in the same commit
3. **Prompt for update** if code changed but PRD wasn't updated

## Quick Start

### Initial Setup (One-Time)

```bash
npm run setup-prd-hook
```

This makes the git hook executable.

### Check PRD Status

```bash
npm run check-prd
```

This checks if the PRD needs updating based on recent code changes.

## How It Works

### Pre-Commit Hook

The hook at `.git/hooks/pre-commit`:

1. Checks staged files for code changes
2. Filters out documentation-only changes
3. Runs `scripts/update-prd.sh` to analyze changes
4. Prompts you to update PRD if needed
5. Allows commit to proceed if PRD was updated or no code changes

### Update Script

The script at `scripts/update-prd.sh`:

1. Compares current code to last PRD update
2. Identifies changed files that may affect PRD
3. Provides guidance on what needs updating
4. Can be run manually or by the hook

## When to Update PRD

### ✅ Update Required

- New features or components
- Database schema changes (migrations)
- New API endpoints
- Integration changes (Aha!, Slack, Google Calendar)
- Authentication/permission changes
- Major user flow changes

### ❌ Update Not Required

- Bug fixes
- Styling/UI tweaks
- Internal refactoring
- Test files
- Documentation (other than PRD)

## Updating the PRD

### Option 1: Manual Update

1. Review your code changes
2. Open `docs/PRD-Retroactive.md`
3. Update relevant sections
4. Commit PRD update with code changes

### Option 2: Ask Cursor AI

For small updates:
```
Update the PRD to reflect the new [feature name] feature I just added
```

For major updates:
```
Can you retroactively generate a PRD for everything that we have built?
```

### Option 3: Include in Same Commit

When committing code changes, include PRD updates:

```bash
git add src/components/NewFeature.tsx
git add docs/PRD-Retroactive.md
git commit -m "feat: add new feature

docs: update PRD for new feature"
```

## Bypassing the Hook

If you need to commit without updating PRD (e.g., WIP commits):

```bash
git commit --no-verify -m "WIP: feature in progress"
```

**Important**: Update the PRD in a follow-up commit before merging.

## Troubleshooting

### Hook Not Running

```bash
# Check if hook is executable
ls -la .git/hooks/pre-commit

# Make it executable
chmod +x .git/hooks/pre-commit
```

### False Positives

If the hook triggers too often, you can:
1. Update PRD to reflect current state
2. Use `--no-verify` for minor changes (update PRD later)
3. Adjust the hook script to be more selective

### PRD Out of Sync

If PRD is significantly outdated:

1. Ask Cursor AI to regenerate the entire PRD
2. Review and commit the updated PRD
3. Future commits will be checked against the new baseline

## Best Practices

1. **Update with Features**: Include PRD updates in feature commits
2. **Keep in Sync**: Don't let PRD drift too far from codebase
3. **Review Regularly**: Periodically review PRD for accuracy
4. **Document Major Changes**: Update PRD immediately for architectural changes

## Related Files

- `docs/PRD-Retroactive.md` - The PRD document
- `.git/hooks/pre-commit` - Git pre-commit hook
- `scripts/update-prd.sh` - PRD update check script
- `.cursorrules` - Cursor AI rules for PRD updates
- `scripts/regenerate-prd.md` - Detailed guide

## CI/CD Integration

To enforce PRD updates in CI/CD, add this to your pipeline:

```yaml
- name: Check PRD is up to date
  run: |
    npm run check-prd || exit 1
```

Or in GitHub Actions:

```yaml
- name: Verify PRD
  run: |
    AUTO_UPDATE_PRD=true bash scripts/update-prd.sh
```

## Questions?

See `scripts/regenerate-prd.md` for more detailed information.

