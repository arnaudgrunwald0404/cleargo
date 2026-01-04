# PRD Auto-Update Guide

## Overview

This repository includes automated checks to ensure the PRD (Product Requirements Document) stays up-to-date with code changes.

## How It Works

### Pre-Commit Hook

A git pre-commit hook automatically checks if code changes warrant PRD updates. The hook:

1. **Detects Code Changes**: Identifies changes to source files (`.ts`, `.tsx`, `.js`, `.jsx`, `.sql`, etc.)
2. **Checks PRD Status**: Verifies if the PRD was updated in the same commit
3. **Prompts for Update**: Reminds you to update the PRD if code changed but PRD didn't

### Update Script

The `scripts/update-prd.sh` script can be run manually to check PRD status:

```bash
npm run check-prd
```

## Setup

### Initial Setup (One-Time)

1. **Make the hook executable**:
   ```bash
   chmod +x .git/hooks/pre-commit
   chmod +x scripts/update-prd.sh
   ```

2. **Verify the hook is active**:
   ```bash
   git commit --allow-empty -m "Test commit"
   ```

### Manual PRD Update

When you make code changes that affect features, you should update the PRD:

1. **Review your changes**:
   ```bash
   git diff HEAD~1
   ```

2. **Ask Cursor AI to update the PRD**:
   - Open `docs/PRD-Retroactive.md`
   - Ask: "Update the PRD based on the recent code changes: [describe changes]"

3. **Or use the check script**:
   ```bash
   npm run check-prd
   ```

## Bypassing the Hook

If you need to commit without updating the PRD (e.g., for WIP commits):

```bash
git commit --no-verify -m "WIP: feature in progress"
```

**Note**: Use `--no-verify` sparingly. The PRD should be kept up-to-date for documentation purposes.

## What Triggers PRD Updates?

The following code changes typically require PRD updates:

- ✅ **New Features**: New components, pages, or major functionality
- ✅ **Database Changes**: New tables, columns, or migrations
- ✅ **API Changes**: New endpoints, modified request/response formats
- ✅ **Integration Changes**: New integrations or significant integration updates
- ✅ **User Flow Changes**: Changes to authentication, permissions, or workflows
- ❌ **Bug Fixes**: Usually don't require PRD updates
- ❌ **Refactoring**: Internal code improvements without feature changes
- ❌ **Styling**: UI/UX improvements without functional changes

## Automated PRD Regeneration

For major updates, you can ask Cursor AI to regenerate the entire PRD:

```
Can you retroactively generate a PRD for everything that we have built?
```

This will analyze the entire codebase and create a comprehensive PRD.

## CI/CD Integration

To enforce PRD updates in CI/CD:

1. Add a check in your CI pipeline:
   ```yaml
   - name: Check PRD is up to date
     run: |
       npm run check-prd || exit 1
   ```

2. Or use the script in GitHub Actions:
   ```yaml
   - name: Verify PRD
     run: |
       AUTO_UPDATE_PRD=true bash scripts/update-prd.sh
   ```

## Troubleshooting

### Hook Not Running

If the pre-commit hook doesn't run:

1. Check if it's executable:
   ```bash
   ls -la .git/hooks/pre-commit
   ```

2. Make it executable:
   ```bash
   chmod +x .git/hooks/pre-commit
   ```

3. Check git config:
   ```bash
   git config core.hooksPath .git/hooks
   ```

### False Positives

If the hook triggers too often:

1. Update `scripts/update-prd.sh` to be more selective
2. Add file patterns to ignore in the hook
3. Use `--no-verify` for minor changes

### PRD Out of Sync

If the PRD is significantly out of sync:

1. Regenerate the entire PRD using Cursor AI
2. Review and commit the updated PRD
3. Future commits will be checked against the new baseline

## Best Practices

1. **Update PRD with Feature Commits**: When committing new features, include PRD updates in the same commit
2. **Review PRD Regularly**: Periodically review the PRD to ensure accuracy
3. **Document Major Changes**: For significant architectural changes, update the PRD immediately
4. **Keep PRD in Sync**: Don't let the PRD drift too far from the codebase

## Related Files

- `docs/PRD-Retroactive.md` - The PRD document
- `.git/hooks/pre-commit` - Git pre-commit hook
- `scripts/update-prd.sh` - PRD update check script
- `package.json` - NPM scripts for PRD management

