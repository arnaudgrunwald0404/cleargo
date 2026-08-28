# ClearGO MCP Server

Manage GTM launch artifacts from Claude Desktop (or any MCP client).

## What it does

Exposes 15 MCP tools across three categories:

### Read tools

| Tool | Description |
|---|---|
| `list-launches` | List active launches |
| `search-launches` | Search launches by name |
| `get-launch` | Fetch launch details (criteria, assets, epics) |
| `list-artifacts` | List artifacts for a launch |
| `get-artifact` | Read artifact content (ai_draft + flags) |
| `get-launch-context` | Gather all context for drafting |
| `diff-artifact` | Compare two generations of an artifact |

### Write tools

| Tool | Description |
|---|---|
| `update-artifact` | Edit ai_draft content (full or targeted) |
| `draft-artifact` | Trigger AI agent to draft an artifact |
| `draft-section` | Re-draft a single section (focused full pipeline) |
| `review-artifact` | Approve / request changes / submit for review |
| `ensure-artifacts` | Ensure artifact rows + Google Docs exist |
| `answer-flags` | Answer open interview flags |

### Conversational tools

| Tool | Description |
|---|---|
| `artifact-chat` | Multi-turn conversation about an artifact (question/review/summary/free) |
| `explain-claim` | Explain grounding behind a specific claim |

---

## Installation

### For external users (recommended)

Install the published NPM package globally:

```bash
npm install -g @cleargo/mcp-server
```

### For developers (source)

```bash
cd src/mcp-server
npm install
npm run build
```

---

## Configuration

The server reads credentials from `~/.cleargo/.env`. Create that file with the values your ClearGo admin provides:

```bash
mkdir -p ~/.cleargo   # macOS/Linux
mkdir $HOME\.cleargo  # PowerShell on Windows

# Then edit ~/.cleargo/.env :
cat > ~/.cleargo/.env << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MCP_SECRET=your-shared-secret
CLEARGO_APP_URL=https://app.cleargo.app    # or your dev URL
MCP_ACTOR_EMAIL=mcp-server@cleargo.local   # optional
EOF
```

> **Note:** The `MCP_SECRET` is only needed for AI draft triggers. Read operations and direct artifact writes work without it.

### What each variable does

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key (bypasses RLS) |
| `MCP_SECRET` | No | Shared secret for AI draft triggers |
| `CLEARGO_APP_URL` | No | ClearGO app URL (default: `https://app.cleargo.app`) |
| `MCP_ACTOR_EMAIL` | No | Identifies the service account for capability checks |

---

## Claude Desktop Setup

Add the server to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cleargo": {
      "command": "cleargo-mcp"
    }
  }
}
```

If you installed from source (not the NPM package), use:

```json
{
  "mcpServers": {
    "cleargo": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/server.js"]
    }
  }
}
```

Restart Claude Desktop. The server connects over stdio and starts automatically when you open a conversation.

---

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