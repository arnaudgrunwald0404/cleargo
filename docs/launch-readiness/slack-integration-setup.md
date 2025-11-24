# Slack Integration Setup Guide

## Overview

This guide covers the complete setup and configuration of the Slack integration for the Launch Readiness Console. The integration enables:

- **Real-time notifications** for launch status changes, criterion updates, and go/no-go decisions
- **Slash commands** for querying launch status and updating criteria
- **Interactive messages** with buttons and dropdowns for quick actions
- **App Home** for personalized launch dashboards
- **URL unfurling** for launch console links shared in Slack

## Prerequisites

- Slack workspace admin access
- Launch Readiness Console deployed and accessible via HTTPS
- Supabase database configured

## Step 1: Create Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"**
3. Select **"From an app manifest"**
4. Choose your workspace
5. Copy the contents of `config/slack-app-manifest.yaml` and paste it
6. Update the placeholder URLs:
   - Replace `https://your-domain.com` with your actual domain (e.g., `https://launch-console.clearcompany.com`)
7. Review and create the app

## Step 2: Install App to Workspace

1. In your app settings, go to **"Install App"**
2. Click **"Install to Workspace"**
3. Review permissions and authorize
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
5. Copy the **Signing Secret** from **"Basic Information"**

## Step 3: Configure Environment Variables

Add the following to your `.env` file:

```bash
# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_ID=your-app-id-here

# Optional: Default notification channel
SLACK_DEFAULT_CHANNEL=#launch-readiness
```

## Step 4: Verify Event Subscriptions

After deploying your app with the Slack endpoints:

1. Go to **"Event Subscriptions"** in your Slack app settings
2. Slack will send a verification challenge to your endpoint
3. Your endpoint at `/api/integrations/slack/events` should respond correctly
4. Once verified, you'll see a green checkmark

## Slack Integration Features

### 1. Slash Commands

#### `/launch-status [launch-name or aha-id]`
Get the current status of a specific launch.

**Example:**
```
/launch-status HIRE-123
```

**Response:**
- Launch name and tier
- Readiness score and status
- Risk level
- Gate criteria summary
- Link to full launch detail

#### `/my-launches`
View all launches you own or are involved with as a decision owner.

**Response:**
- List of your launches
- Quick status indicators
- Overdue criteria count
- Links to launch details

#### `/launch-summary [tier] [risk-level]`
Get a summary of all active launches, optionally filtered.

**Examples:**
```
/launch-summary
/launch-summary tier-1
/launch-summary high-risk
/launch-summary tier-2 medium
```

#### `/update-criterion [launch-id] [criterion-id] [status]`
Quick update of a criterion status (for decision owners).

**Example:**
```
/update-criterion abc-123 def-456 go
```

### 2. Notifications

The integration sends notifications for:

#### Stale Criterion Reminders
- **Trigger:** Criterion not updated in 14+ days (configurable)
- **Recipients:** Decision owner
- **Frequency:** Daily
- **Content:** Criterion details, launch context, update link

#### Launch Risk Alerts
- **Trigger:** Launch enters high-risk status
- **Recipients:** Launch owner, Product Ops, CPO
- **Content:** Risk factors, gate blockers, action items

#### Go/No-Go Decision Notifications
- **Trigger:** Decision snapshot created
- **Recipients:** Launch owner, stakeholders
- **Content:** Decision verdict, notes, conditions

#### Weekly Leadership Digest
- **Trigger:** Monday 9:00 AM (configurable)
- **Recipients:** CPO, Product Leads
- **Content:** Top launches by tier/risk, upcoming launches, blockers

#### Launch Status Changes
- **Trigger:** Readiness status changes (Go → Conditional, etc.)
- **Recipients:** Launch owner, watchers
- **Content:** Old vs new status, contributing factors

### 3. Interactive Messages

Messages include interactive components:

- **Update Status** buttons for quick criterion updates
- **View Details** links to launch console
- **Snooze Reminder** for stale criterion notifications
- **Add Condition** for conditional go statuses

### 4. App Home

When users open the app in Slack, they see:

- **My Launches** - Launches they own
- **My Criteria** - Criteria they're decision owner for
- **Overdue Items** - Items requiring attention
- **Quick Actions** - Links to common tasks

### 5. URL Unfurling

When launch console URLs are shared in Slack:

```
https://launch-console.clearcompany.com/launch/abc-123
```

The app automatically unfurls with:
- Launch name and tier
- Current readiness status
- Risk level
- Gate summary
- Target launch date

## Notification Channel Configuration

### Default Channels

Configure default notification channels in the database `settings` table:

```sql
UPDATE settings SET 
  slack_channels = jsonb_build_object(
    'leadership_digest', '#leadership-launches',
    'high_risk_alerts', '#launch-alerts',
    'go_no_go_decisions', '#product-decisions'
  );
```

### Per-Launch Channels

Launches can have custom Slack channels configured in the `launches` table:

```sql
ALTER TABLE launches ADD COLUMN slack_channel TEXT;
```

## User Slack Handle Mapping

The system uses the `slack_handle` field in the `users` table to mention users in notifications.

### Auto-sync from Slack

The integration can auto-populate `slack_handle` by matching email addresses:

```typescript
// This happens automatically when users interact with the app
// or can be triggered manually via admin command
```

### Manual Configuration

Admins can set Slack handles in the user management UI or directly:

```sql
UPDATE users 
SET slack_handle = '@john.doe' 
WHERE email = 'john.doe@clearcompany.com';
```

## Testing the Integration

### 1. Test Slash Commands

In any Slack channel:
```
/launch-status
/my-launches
```

### 2. Test Notifications

Trigger a notification manually via API:

```bash
curl -X POST https://your-domain.com/api/integrations/slack/test-notification \
  -H "Content-Type: application/json" \
  -d '{
    "type": "stale_criterion",
    "userId": "user-id-here"
  }'
```

### 3. Test URL Unfurling

Share a launch URL in Slack:
```
https://launch-console.clearcompany.com/launch/abc-123
```

### 4. Test Interactive Components

Click buttons in notification messages to verify interactivity works.

## Troubleshooting

### Events Not Received

1. Check that your endpoint is publicly accessible via HTTPS
2. Verify the signing secret matches
3. Check application logs for verification errors
4. Ensure event subscriptions are enabled in Slack app settings

### Slash Commands Not Working

1. Verify the command URLs are correct and accessible
2. Check that the app is installed to the workspace
3. Ensure the bot token has the `commands` scope
4. Check application logs for errors

### Notifications Not Sending

1. Verify `SLACK_BOT_TOKEN` is set correctly
2. Check that the bot is invited to the target channel
3. Ensure the bot has `chat:write` permission
4. Check notification logs in the database

### URL Unfurling Not Working

1. Verify `links:read` and `links:write` scopes are granted
2. Check that the domain is listed in `app_unfurl_domains`
3. Ensure the unfurl endpoint is responding correctly

## Security Considerations

### Request Verification

All incoming requests from Slack are verified using the signing secret:

```typescript
import crypto from 'crypto';

function verifySlackRequest(req: Request, signingSecret: string): boolean {
  const timestamp = req.headers.get('x-slack-request-timestamp');
  const signature = req.headers.get('x-slack-signature');
  
  // Prevent replay attacks (timestamp should be within 5 minutes)
  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - parseInt(timestamp)) > 300) {
    return false;
  }
  
  const body = await req.text();
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}
```

### Token Rotation

Enable token rotation in Slack app settings for enhanced security.

### Rate Limiting

The integration respects Slack's rate limits:
- Tier 1: 1 request per second
- Tier 2: 20 requests per minute
- Tier 3: 50 requests per minute for posting messages

## Maintenance

### Updating Scopes

If you need to add new scopes:

1. Update `config/slack-app-manifest.yaml`
2. Go to Slack app settings → **"OAuth & Permissions"**
3. Add the new scopes
4. Reinstall the app to workspace

### Monitoring

Monitor Slack integration health:

- Check notification delivery rates in `notification_log` table
- Monitor API error rates
- Set up alerts for failed Slack API calls
- Track slash command usage

## Additional Resources

- [Slack API Documentation](https://api.slack.com/)
- [Block Kit Builder](https://app.slack.com/block-kit-builder) - Design interactive messages
- [Slack App Manifest Reference](https://api.slack.com/reference/manifests)
