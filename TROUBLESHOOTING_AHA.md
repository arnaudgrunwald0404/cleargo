# Aha! Integration Troubleshooting Guide

## Quick Diagnostic Steps

### 1. Test API Connection
Navigate to: `http://localhost:3000/test/aha`

Click **"Test Connection"** to verify:
- ✅ API credentials are valid
- ✅ You have access to Aha!
- ✅ Domain and token are correct

**Expected Result:** Account information JSON
**If it fails:** Check `.env.local` for `AHA_DOMAIN` and `AHA_API_TOKEN`

---

### 2. List Available Epics

On the test page, click **"List Epics"**

This shows you the first 10 epics with:
- `id` - The epic identifier (e.g., `PROJ-E-123`)
- `reference_num` - Alternative ID
- `name` - Epic title  
- `tags` - Array of tags (e.g., `["LaunchConsole", "Tier1"]`)
- `custom_fields` - All custom field values

**What to look for:**
- Do your epics have tags like `LaunchConsole`, `cleargo`, `ClearGO`, or `ClearGo`?
- Is the `launch_candidate` custom field set to `true`?
- Are there other tags your team uses?

---

### 3. Understanding the Tag Filter

Epics are imported ONLY if:
1. **Launch Candidate = true** (custom field in Aha!), OR
2. **Has ANY of the configured tags**

Current default tags (check Settings to see yours):
- `LaunchConsole`
- `cleargo`
- `ClearGO`
- `ClearGo`

**Location in code:** `src/lib/aha/mapping.ts` - `shouldProcessEpic()` function

---

### 4. Update Settings

If your epics use different tags:

1. Go to **Admin → Settings**
2. Scroll to **"Aha! Integration"** section
3. Look for **"Aha! Integration Tags"** field
4. Add the tags your epics actually use
5. Click **Save**

---

## Common Errors

### Error: "404 - Record not found"

**Causes:**
1. Epic ID doesn't exist in Aha!
2. Epic was deleted
3. You don't have permission to view that epic
4. Using wrong ID format (database UUID instead of Aha! ID)

**Solution:**
- Use "List Epics" to find valid IDs
- Use the `reference_num` or `id` from the API response
- Example: `PROJ-E-123` (not a UUID)

---

### Error: "Epics not syncing"

**Check:**
1. Are webhooks configured in Aha! workspace?
   - URL: `https://your-domain.com/api/integrations/aha/webhook`
   - Events: Epic created, Epic updated

2. Do epics have required tags?
   - Check server logs for: `⏭️ Skipping: Epic does not match filter criteria`

3. Are tags configured correctly in Settings?

---

### Error: "Custom fields not loading"

**Solution:**
1. Go to **Admin → Settings**
2. Find **"AHA Custom Fields to Load"** section
3. Add field aliases you want to sync
4. Click **"Sync All Epics"** to re-fetch with new fields

---

## Testing Webhook Manually

You can trigger a webhook test:

```bash
# Check if test-webhook.sh exists in project root
cat test-webhook.sh

# Or manually trigger with curl
curl -X POST http://localhost:3000/api/integrations/aha/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "epic.updated",
    "epic": {
      "id": "YOUR-EPIC-ID",
      "reference_num": "YOUR-EPIC-ID"
    }
  }'
```

---

## Checking Logs

Watch server logs for these messages:

```
📥 Webhook received:           # Webhook arrived
✅ Epic matches filter         # Epic passed tag filter
⏭️ Skipping: Epic does not    # Epic rejected (no matching tags)
🆕 Epic created:              # New epic imported
🔄 Epic updated:              # Existing epic updated
```

---

## Next Steps

1. ✅ Test connection
2. ✅ List epics to see tags
3. ✅ Update settings with correct tags
4. ✅ Configure webhooks in Aha!
5. ✅ Test with a webhook

---

## Need Help?

If issues persist:
1. Check environment variables in `.env.local`
2. Verify Aha! API token has correct permissions
3. Check that epics are in a workspace your token can access
4. Look at server console for detailed error messages






