# Slack notifications troubleshooting

If a user (e.g. Mpaiva@clearcompany.com) is not receiving Slack notifications, check the following.

## 1. User exists in app and has Slack notifications enabled

- **User Management** (Settings → User Management): the user must exist in the list with the same email.
- **Receive Slack notifications**: for that user, the "Receive Slack notifications" toggle must be **ON**. If it is off, notifications are logged but not sent to Slack.

## 2. User is in the Slack workspace with that email

- The user must be a member of the **same Slack workspace** the app is connected to.
- Their Slack profile **email must match** the app email (e.g. `Mpaiva@clearcompany.com` or `mpaiva@clearcompany.com`). The app looks up by email (case-insensitive for the Slack API).

## 3. Slack handle is synced

- The app sends DMs using `app_user.slack_handle` (Slack user ID, e.g. `U01234ABCD`).
- If `slack_handle` is missing, the app tries to sync it once when sending (via Slack’s `users.lookupByEmail`). If the user isn’t found in Slack or the email doesn’t match, the DM is skipped.

**To sync Slack handles for all users (admin):**

- Call the admin sync endpoint (e.g. `GET /api/admin/slack-sync` with an admin session), or use the script `scripts/sync-slack-handles.js` if available.

**To verify one user (admin):**

- `GET /api/admin/slack-lookup?email=Mpaiva@clearcompany.com` — returns whether Slack finds that email and the Slack user ID.
- `GET /api/admin/slack-lookup?email=Mpaiva@clearcompany.com&sendTest=true` — same plus sends a test DM.

## 4. After fixing

- Ensure "Receive Slack notifications" is ON for the user.
- Trigger a full Slack handle sync so `slack_handle` is set for that user.
- Retry the action that should send the notification (e.g. delegate a task to them again).

## Summary checklist for Mpaiva@clearcompany.com

1. [ ] User exists in User Management with email `Mpaiva@clearcompany.com` (or matching casing).
2. [ ] "Receive Slack notifications" is **ON** for that user.
3. [ ] They are in the correct Slack workspace with that email in their profile.
4. [ ] Run Slack handle sync (admin sync or script), then confirm via `/api/admin/slack-lookup?email=Mpaiva@clearcompany.com`.
5. [ ] Retry sending a notification (e.g. delegate a criterion to them).
