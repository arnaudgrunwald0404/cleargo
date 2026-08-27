# ClearGO MCP Server

Manage GTM launch artifacts from Claude Desktop (or any MCP client).

## What it does

Exposes 10 MCP tools that let you manage launch artifacts conversationally:

| Tool | Description |
|---|---|
| `list-launches` | List active launches |
| `search-launches` | Search launches by name |
| `get-launch` | Fetch launch details (criteria, assets, epics) |
| `list-artifacts` | List artifacts for a launch |
| `get-artifact` | Read artifact content (ai_draft + flags) |
| `get-launch-context` | Gather all context for drafting |
| `update-artifact` | Edit ai_draft content (full or targeted) |
| `draft-artifact` | Trigger AI agent to draft an artifact |
| `review-artifact` | Approve / request changes / submit for review |
| `ensure-artifacts` | Ensure artifact rows + Google Docs exist |

## Prerequisites

- Node.js 18+
- The ClearGO app running (locally or in production)
- Supabase service-role key
- `MCP_SECRET` — a shared secret for MCP ↔ API auth

## Setup

### 1. Install dependencies

```bash
cd src/mcp-server
npm install
```

### 2. Configure environment

The server loads `.env` from the ClearGO project root automatically. Ensure these are set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MCP_SECRET=your-shared-secret
CLEARGO_APP_URL=http://localhost:3000    # or your production URL
MCP_ACTOR_EMAIL=mcp-server@cleargo.local # optional
```

### 3. Build

```bash
npm run build
```

### 4. Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "cleargo": {
      "command": "node",
      "args": ["C:/path/to/cleargo/src/mcp-server/dist/server.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "MCP_SECRET": "your-shared-secret",
        "CLEARGO_APP_URL": "http://localhost:3000"
      }
    }
  }
}
```

### 5. Restart Claude Desktop

The server connects over stdio. Claude Desktop will start it automatically when you open a conversation.

## Architecture

- **Reads/writes:** Direct Supabase access via service-role client (bypasses RLS)
- **AI draft:** Calls `/api/internal/artifacts` on the ClearGO app (authenticated with `MCP_SECRET`)
- **Auth:** No user session — the server operates as a service account identified by `MCP_ACTOR_EMAIL`

## Development

```bash
npm run dev    # tsx watch — auto-reloads on file changes
npm run build  # TypeScript compilation
npm start      # Run the built server
```