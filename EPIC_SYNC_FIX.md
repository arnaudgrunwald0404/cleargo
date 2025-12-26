# Epic Tag Sync Issue - Resolution Summary

## Problem
New epics with tags `ClearGO` and `LaunchConsole` were not appearing in ClearGO, even though webhooks were working for existing epics.

## Root Cause
Migration `0018_rename_launch_to_epic.sql` was applied to the database (renaming the `launch` table to `epic`), but the application code still had references to the old `launch` table name.

**What was happening:**
1. Webhook received epic update from Aha!
2. Webhook code tried to write to `launch` table (which no longer exists)
3. Write failed silently (table not found)
4. New epic never appeared in the system

## Files Fixed
Updated all references from `launch` table to `epic` table in:

1. **`src/lib/db/epics.ts`**
   - `getEpicByAhaId()` - line 53
   - `upsertEpicFromAha()` - lines 131, 142
   - `updateEpicReadiness()` - line 284

2. **`src/lib/readiness.ts`**
   - `recomputeEpicReadiness()` - lines 13, 43, 173

3. **`src/lib/aha/write-back.ts`**
   - `writeBackEpicReadiness()` - line 67

4. **`src/lib/snapshots.ts`**
   - `createSnapshot()` - line 31

5. **API Routes:**
   - `src/app/api/dashboard/releases-needing-feedback/route.ts`
   - `src/app/api/dashboard/metrics/route.ts`
   - `src/app/api/jobs/leadership-digest/route.ts`
   - `src/app/api/integrations/slack/commands/launch-status/route.ts`
   - `src/app/api/integrations/slack/commands/my-launches/route.ts`

## Verification
✅ Test confirmed: Webhooks can now successfully write to the `epic` table
✅ Epics with tags `ClearGO` and `LaunchConsole` will now appear in the system

## Next Steps for User
1. **No migration needed** - the database migration was already applied
2. **No data loss** - existing epics are already in the `epic` table
3. **Test the fix:**
   - Add tags `ClearGO` or `LaunchConsole` to a new epic in Aha!
   - The epic should now appear in ClearGO within seconds (via webhook)
4. **Watch server logs** for confirmation:
   - Look for: `📥 Webhook received`
   - Followed by: `✅ Epic matches filter criteria`
   - And: `🆕 Epic created` or `🔄 Epic updated`

## Technical Details
The `src/lib/epics.ts` file has fallback logic to check both `epic` and `launch` tables for backwards compatibility. This is fine to keep, but the primary write operations needed to use the `epic` table to match the current database schema.

Date: 2025-12-12






