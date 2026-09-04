# ClearGO MCP Connector

Manage GTM launch artifacts from Claude Desktop.

## For teammates: connecting

1. Claude Desktop → **Settings → Connectors → Add custom connector**
2. URL: `https://cleargo.netlify.app/api/mcp`
3. Click through the browser sign-in and press **Allow**

That is the whole setup. There is nothing to install, no client ID or secret to
paste, and no configuration file to edit — Claude Desktop registers itself
automatically and the connection is tied to your own ClearGO account.

You will only see the launches you would see in the app, and the connector can
only do what your role lets you do. A PM can draft and submit an artifact for
review; approving one needs PMM, CPO, or Product Ops.

### Disconnecting

Remove the connector in Claude Desktop. To revoke access from the ClearGO side,
delete the row in `mcp_oauth_token` for your email — your access token keeps
working until it expires, at most an hour.

---

## Tools

### Read

| Tool | Description |
|---|---|
| `list-launches` | List active launches |
| `search-launches` | Find launches by name |
| `get-launch` | One launch in full — criteria, assets, epics |
| `list-artifacts` | A launch's artifacts with status and document links |
| `get-artifact` | One artifact's content, open flags, and history |
| `get-launch-context` | Everything the drafting agent would see |
| `diff-artifact` | Compare two generations of an artifact |
| `explain-claim` | Where a specific claim came from and how well grounded it is |
| `artifact-chat` | Ask a question, request a review, or get a summary |

### Write

| Tool | Description | Capability |
|---|---|---|
| `ensure-artifacts` | Create missing artifact rows and Google Docs | `launchArtifact.draft` |
| `draft-artifact` | Run the agent to draft or re-draft an artifact | `launchArtifact.draft` |
| `draft-section` | Re-draft one section with targeted instructions | `launchArtifact.draft` |
| `update-artifact` | Edit drafted content directly | `launchArtifact.draft` |
| `answer-flags` | Answer the questions a draft raised | `launchArtifact.draft` |
| `review-artifact` | Submit, send back, or approve | `launchArtifact.review` / `.approve` |

### Drafting is asynchronous

`draft-artifact`, `draft-section`, and (when documents are missing)
`ensure-artifacts` return in about a second with the work still running.

Netlify kills a synchronous function at 26 seconds and ignores `maxDuration`, so
drafting — which takes one to three minutes — runs in a background function
instead. The tool claims the row as `DRAFTING` and hands off; poll `get-artifact`
until the status becomes `PENDING_REVIEW`. The tool response says so explicitly,
so the model polls rather than reading stale content and reporting it as new.

Locally there is no such cap, so the same tools run inline and return the
finished draft.

---

## How it works

```
Claude Desktop
   │  1. POST /api/mcp with no token
   │     ← 401 + WWW-Authenticate: Bearer resource_metadata="…"
   │
   │  2. GET /.well-known/oauth-protected-resource/api/mcp   (RFC 9728)
   │     GET /.well-known/oauth-authorization-server          (RFC 8414)
   │
   │  3. POST /api/oauth/register                             (RFC 7591 — DCR)
   │  4. GET  /api/oauth/authorize → login → /oauth/consent → code
   │  5. POST /api/oauth/token (PKCE S256) → access + refresh token
   │
   └─ 6. POST /api/mcp with Bearer token
```

- **Resource server:** `src/app/api/mcp/route.ts`
- **Authorization server:** `src/app/api/oauth/{authorize,token,register,revoke}`
- **Shared logic:** `src/lib/oauth/`
- **Tools:** `src/lib/mcp/tools/` — one registry table in `index.ts` holds all 46, team-management included. **This table is shared with the in-app ClearGO assistant** (`src/lib/ai/mcpTools.ts`), so a tool registered anywhere else is reachable from Claude Desktop and not from the assistant. Add tools to the table.
- **Capability checks:** `actorCan` in `src/lib/permissions-server.ts`, which resolves the DB overrides an admin sets in Settings. Do not use `canRolesPerform` here: it closes over `DEFAULT_RULES` and cannot see them.
- **Caller identity:** `src/lib/mcp/actor.ts` maps the OAuth subject to an `app_user` row. Writes need it — attribution columns are uuid FKs — and roles come from that row rather than the access token, which lives an hour.

### Design notes

**Access tokens are stateless JWTs** signed with `MAGIC_LINK_SECRET`, valid one
hour, audience-bound to the MCP endpoint. They carry the caller's email and
roles, so a tool call costs a signature check and no database round trip. They
cannot be revoked before expiry — that is what the one-hour TTL is for.

**Refresh tokens rotate** and only their SHA-256 lands in the database. Each use
issues a new one and revokes the old, so reuse is detectable.

**Roles are re-read on every token exchange**, never carried forward. Reducing
someone's access in the app takes effect within the hour rather than at the end
of a thirty-day refresh chain.

**PKCE S256 is mandatory.** Registered clients are public — an installed
application cannot keep a secret — so PKCE is what protects the code exchange.
`plain` is neither advertised nor accepted.

**A replayed authorization code revokes the tokens issued from it.** A second
presentation means the code leaked, so everything derived from that
authorization is dropped and the user re-consents.

**The consent screen is not ceremony.** Registration is open by design, so any
client can obtain a `client_id`. The only thing between a registered client and
someone's data is that person reading a page that names it and pressing Allow.

---

## Operations

### Environment

No new variables. It reuses `MAGIC_LINK_SECRET` (token signing),
`NEXT_PUBLIC_APP_URL` (issuer identity — must match the host clients reach),
and the Supabase service-role key.

`CLEARGO_AI_API_KEY` still works as a legacy `X-ClearGo-Key` header for the older
team-management tools. It authenticates as a service account with **no roles**,
so every capability-gated tool refuses it. Remove it once those callers move to
OAuth.

### Migration

`supabase/migrations/20260831000000_mcp_oauth.sql` adds `mcp_oauth_client`,
`mcp_oauth_authorization_code`, and `mcp_oauth_token`.

`.github/workflows/supabase-migrations.yml` applies it to **development
automatically** when the merge to `main` touches `supabase/migrations/**`.
**Production is not on that trigger** — it needs a manual run of that workflow
with `target=production` and the typed phrase `apply to production`.

**Apply to production before merging, not after.** Netlify deploys the code the
moment `main` moves, so between the merge and the dispatch, production is serving
OAuth endpoints against a schema with no `mcp_oauth_*` tables: registration 500s
and the connector cannot be added.

### Debugging

| Symptom | Look at |
|---|---|
| "Could not connect", no browser opens | `curl -i -X POST https://…/api/mcp` — is there a `WWW-Authenticate` header? |
| Browser opens, then "Unknown client" | The migration has not been applied |
| Consent screen then an error page | `[oauth/authorize]` logs; usually a `redirect_uri` mismatch |
| Connects, but every write is refused | The account has no `app_user` row, or a role without the capability |
| Draft never finishes | `netlify logs:function artifact-draft-background` |

Grep production logs for `[oauth/register]`, `[oauth/authorize]`,
`[oauth/token]`, and `[mcp route]`.
