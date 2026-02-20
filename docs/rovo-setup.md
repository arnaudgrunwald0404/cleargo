# ROVO MCP Server Integration Setup

This guide explains how to set up the ROVO MCP Server integration for ClearGO.

## Overview

ROVO is Atlassian's AI assistant that integrates with Jira and Confluence. The integration allows you to search and summarize content from Jira issues and Confluence pages.

## Prerequisites

- An Atlassian Cloud site with Jira and/or Confluence
- Admin access to ClearGO
- Ability to create OAuth apps in Atlassian

## Setup Steps

### 1. Create an Atlassian OAuth App

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click **"Create"** → **"OAuth 2.0 (3LO)"**
3. Fill in the app details:
   - **Name**: ClearGO ROVO Integration (or your preferred name)
   - **Description**: Integration for ROVO MCP Server access
4. Set the **Authorization callback URL** to match your app's URL:
   - **Production**: `https://cleargo.netlify.app/api/integrations/rovo/oauth`
   - **Local Development**: `http://localhost:3000/api/integrations/rovo/oauth`
   - **Custom Domain**: `https://your-domain.com/api/integrations/rovo/oauth`
   
   ⚠️ **Important**: The URL must match **exactly** (including protocol, domain, path, and no trailing slash). You can see the exact URL needed in the ROVO settings page.
   
   **Note**: If testing locally, you may need to add `http://localhost:3000` as an allowed callback URL in your Atlassian OAuth app settings.
5. Add the following **granular scopes** (minimal permissions needed):
   - `read:jira-work` - Read Jira issues, epics, and stories (for search/summarize)
   - `read:jira-user` - Read Jira user information (for context)
   - `read:confluence-content.summary` - Read Confluence page summaries (for search/summarize)
   - `read:confluence-space.summary` - Read Confluence space information (for context)
   - `offline_access` - Request refresh tokens (required for token refresh)
   
   **Note**: These are granular scopes that provide minimal read-only access. The integration only needs read permissions for search and summarize functionality.
6. Click **"Create"**
7. Copy the **Client ID** and **Client Secret**

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
# ROVO OAuth Credentials
ROVO_OAUTH_CLIENT_ID=your_client_id_here
ROVO_OAUTH_CLIENT_SECRET=your_client_secret_here
```

Alternatively, you can use the generic Atlassian OAuth variables:

```bash
ATLASSIAN_OAUTH_CLIENT_ID=your_client_id_here
ATLASSIAN_OAUTH_CLIENT_SECRET=your_client_secret_here
```

### 3. Restart Your Application

After adding the environment variables, restart your Next.js application:

```bash
npm run dev
```

### 4. Connect ROVO

1. Navigate to **Settings > Integrations > ROVO**
2. Click **"Connect to ROVO"**
3. You'll be redirected to Atlassian's authorization page
4. Log in with your Atlassian account
5. Review and approve the requested permissions
6. You'll be redirected back to ClearGO
7. The connection status should show as "Connected"

## Usage

Once connected, you can use the ROVO integration through the API endpoints:

### Search Jira/Confluence

```bash
POST /api/integrations/rovo/search
Content-Type: application/json

{
  "query": "search term",
  "contentType": "both", // or "jira" or "confluence"
  "limit": 10
}
```

### Summarize Content

```bash
POST /api/integrations/rovo/summarize
Content-Type: application/json

{
  "contentId": "JIRA-123", // or Confluence page ID
  "contentType": "jira" // or "confluence"
}
```

### Check Connection Status

```bash
GET /api/integrations/rovo/status
```

### Disconnect

```bash
POST /api/integrations/rovo/disconnect
```

## Troubleshooting

### "ROVO authentication failed. Token is invalid or expired"

**Important**: ROVO MCP Server uses OAuth 2.1 with dynamic client registration and is designed for MCP protocol clients (like ChatGPT, Claude desktop apps) that use streaming connections, not direct HTTP REST API calls.

The current implementation attempts to use Atlassian's standard OAuth endpoint, but ROVO MCP Server may require tokens issued through its own authorization server (discovered via `WWW-Authenticate` headers).

**Possible solutions:**
1. **Reconnect**: Click "Connect to ROVO" again - the token may have been invalid from the start
2. **Check token source**: Ensure you're using an OAuth app configured specifically for ROVO MCP Server access
3. **Use MCP SDK**: For full ROVO functionality, consider using the `@modelcontextprotocol/sdk` client instead of direct HTTP calls

### "We couldn't identify the app requesting access"

This error means the OAuth client ID is not configured or incorrect. Make sure:
1. You've created an OAuth app in Atlassian Developer Console
2. The Client ID is correctly set in your `.env` file
3. The callback URL matches exactly (including https/http and trailing slashes)
4. You've restarted your application after adding the environment variables

### "Failed to exchange authorization code"

This usually means:
1. The Client Secret is incorrect or missing
2. The callback URL doesn't match what's configured in Atlassian
3. The authorization code has expired (try connecting again)

### Token Expired

If your token expires, simply click "Connect to ROVO" again to refresh it. The integration will request a new token automatically.

## Security Notes

- OAuth tokens are stored encrypted in the database
- Tokens respect your existing Jira and Confluence permissions
- Only users with SUPERADMIN, PRODUCT_OPS, or CPO roles can manage the ROVO integration
- Tokens can be revoked at any time from the ROVO settings page

## Additional Resources

- [Atlassian OAuth Documentation](https://developer.atlassian.com/cloud/oauth/)
- [ROVO MCP Server Documentation](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/)
