# Slack Integration Implementation Plan

## Overview
Comprehensive Slack integration for Launch Readiness Console enabling real-time notifications, slash commands, interactive messages, and URL unfurling.

## Components Created

### 1. Configuration
- **`config/slack-app-manifest.yaml`** - Complete Slack app manifest with all scopes, commands, and event subscriptions
  - 4 slash commands: `/launch-status`, `/my-launches`, `/launch-summary`, `/update-criterion`
  - Event subscriptions for app home, mentions, DMs, and link sharing
  - Interactive components enabled
  - URL unfurling for launch console links

### 2. Documentation
- **`docs/launch-readiness/slack-integration-setup.md`** - Comprehensive setup guide
  - Step-by-step app creation and installation
  - Environment variable configuration
  - Feature descriptions and usage examples
  - Testing procedures
  - Troubleshooting guide
  - Security considerations

### 3. Type Definitions
- **`src/types/slack.ts`** - TypeScript types for all Slack interactions
  - Notification types and payloads
  - Command and interaction structures
  - Event payloads
  - API response types

### 4. Core Libraries

#### Slack Client (`src/lib/slack/client.ts`)
- Post and update messages
- User lookup by ID or email
- Reactions
- File uploads
- Modal views (open, update, publish to home)

#### Message Templates (`src/lib/slack/templates.ts`)
- Stale criterion reminders
- Launch risk alerts
- Go/No-Go decision notifications
- Weekly digest
- Launch status changes
- URL unfurling for launch links

#### Request Verification (`src/lib/slack/verify.ts`)
- HMAC signature verification
- Replay attack prevention
- Header extraction utilities

#### Notification Service (`src/lib/slack/notifications.ts`)
- Send individual and batch notifications
- Route to channels or DMs
- Notification logging (TODO: database integration)
- Slack handle synchronization

### 5. API Routes

#### Events Endpoint (`src/app/api/integrations/slack/events/route.ts`)
- URL verification challenge handling
- App home opened
- App mentions
- Direct messages
- Link shared (for unfurling)

#### Interactions Endpoint (`src/app/api/integrations/slack/interactions/route.ts`)
- Button clicks
- Dropdown selections
- Modal submissions
- Action routing

#### Slash Commands
- **`/launch-status`** - Get launch status by name or Aha ID
- **`/my-launches`** - View user's launches and criteria

## Environment Variables Required

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_ID=your-app-id
SLACK_DEFAULT_CHANNEL=#launch-readiness
```

## Next Steps for Full Implementation

### Database Integration
1. Add notification logging to `notification_log` table
2. Implement Slack handle sync with `users` table
3. Add `slack_channel` field to `launches` table for custom channels
4. Store Slack message timestamps for threading

### Complete Event Handlers
1. **App Home** - Build personalized dashboard with user's launches and overdue items
2. **Link Unfurling** - Query launch data and unfurl with rich preview
3. **App Mentions** - Respond with helpful commands and information
4. **DMs** - Interactive conversation for status updates

### Complete Slash Commands
1. Integrate with database to fetch real launch data
2. Add `/launch-summary` with tier and risk filtering
3. Add `/update-criterion` for quick status updates
4. Implement user authentication/authorization

### Notification Triggers
1. **Stale Criteria** - Nightly job checking `last_updated_at`
2. **Risk Alerts** - Trigger on readiness recompute when risk increases
3. **Go/No-Go Decisions** - Trigger on snapshot creation
4. **Weekly Digest** - Weekly scheduled job (Monday 9 AM)
5. **Status Changes** - Trigger on `readiness_status` update

### Interactive Features
1. Implement "Update Status" button → open modal with status form
2. Implement "Snooze Reminder" → update notification schedule
3. Add criterion status dropdown in messages
4. Add "Add Condition" flow for conditional go statuses

### Testing
1. Unit tests for message templates
2. Integration tests for API endpoints
3. E2E tests for notification flows
4. Load testing for batch notifications

## Security Checklist
- ✅ Request signature verification implemented
- ✅ Replay attack prevention (5-minute window)
- ✅ Timing-safe signature comparison
- ⏳ Rate limiting (TODO)
- ⏳ Token rotation enabled in Slack app settings (manual step)
- ⏳ Audit logging for all Slack actions (TODO)

## Deployment Checklist
1. Set environment variables in production
2. Update manifest URLs to production domain
3. Reinstall app to workspace with production URLs
4. Verify event subscriptions endpoint
5. Test all slash commands
6. Configure default notification channels
7. Run Slack handle sync for existing users
8. Set up monitoring and alerts

## Monitoring
- Track notification delivery rates
- Monitor Slack API error rates
- Alert on failed notifications
- Track slash command usage
- Monitor event processing latency
