# ClearGO AI API — Reference

Read-only REST API for the AI chief-of-staff system. Provides structured data for generating 1:1 prep packs, surfacing blockers, and summarising launch readiness across Arnaud's direct reports.

## Base URL

| Environment | Base URL |
|---|---|
| Production | `https://<your-netlify-site>.netlify.app` |
| Local (Netlify Dev) | `http://localhost:8888` |

All endpoints are under the `/api/v1/` prefix.

## Authentication

Every request must include the API key in a custom header:

```
X-ClearGo-Key: <your-api-key>
```

The key is validated against the `CLEARGO_AI_API_KEY` environment variable on the server. Requests with a missing or incorrect key receive a `401 Unauthorized` response.

Set the key in Netlify's environment variables panel (Site settings → Environment variables) or in `.env.local` for local development.

## CORS

All endpoints respond to `OPTIONS` preflight requests with `Access-Control-Allow-Origin: *`. You can call these endpoints directly from browser-based tools or Jupyter notebooks.

## Error responses

All errors return JSON with a single `error` string. Raw database errors are never exposed.

| Status | Meaning |
|---|---|
| `400 Bad Request` | Missing or invalid parameter |
| `401 Unauthorized` | Missing or incorrect `X-ClearGo-Key` |
| `404 Not Found` | Requested resource does not exist |
| `500 Internal Server Error` | Unexpected server-side failure |

```json
{ "error": "Not found" }
```

---

## Endpoints

### 1. List team members

Returns all active direct reports with a quick health snapshot (active epics count, open blockers count).

```
GET /api/v1/team-members
```

**Parameters:** none

**Response**

```json
{
  "data": [
    {
      "id": "a1000000-0000-0000-0000-000000000001",
      "name": "Dan Pope",
      "email": "dpope@clearcompany.com",
      "role": "PM",
      "slack_handle": "dan.pope",
      "active_epics_count": 2,
      "open_blockers_count": 1
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string (UUID)` | User ID — use this as `:id` in the team-member sub-endpoints |
| `name` | `string` | Display name |
| `email` | `string` | Work email |
| `role` | `string` | Role code: `PM`, `PMM`, `ENG`, `PRODUCT`, etc. |
| `slack_handle` | `string \| null` | Slack username (without `@`) |
| `active_epics_count` | `number` | Epics with status outside `LAUNCHED`, `CANCELLED`, `ARCHIVED` |
| `open_blockers_count` | `number` | Open blockers across all of this person's epics |

**Example**

```bash
curl -s -H "X-ClearGo-Key: $CLEARGO_AI_API_KEY" \
  "$BASE_URL/api/v1/team-members" | python3 -m json.tool
```

---

### 2. Team member epics

Returns all epics owned by a specific team member. Supports optional status filtering.

```
GET /api/v1/team-members/:id/epics
GET /api/v1/team-members/:id/epics?status=IN_PROGRESS
```

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `:id` | `UUID` | Team member ID from `/api/v1/team-members` |

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `string` | No | Filter by exact epic status. See status values below. |

**Epic status values**

| Value | Meaning |
|---|---|
| `PLANNED` | Not started yet |
| `IN_PROGRESS` | Actively being worked on |
| `LAUNCHED` | Shipped / complete |
| `CANCELLED` | Cancelled |
| `ARCHIVED` | Archived |
| `COMPLETED` | Completed (non-launch) |

**Response**

```json
{
  "member": {
    "id": "a1000000-0000-0000-0000-000000000001",
    "name": "Dan Pope",
    "email": "dpope@clearcompany.com"
  },
  "data": [
    {
      "id": "c1000000-0000-0000-0000-000000000001",
      "name": "Launch Readiness Dashboard v2",
      "status": "IN_PROGRESS",
      "tier": "TIER_1",
      "target_launch_date": "2026-05-15",
      "risk_level": "medium",
      "readiness_score": 72,
      "product_name": "ClearGO Platform"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string (UUID)` | Epic ID — use as `:id` in `/api/v1/epics/:id` |
| `tier` | `string` | `TIER_1` (highest priority), `TIER_2`, `TIER_3` |
| `target_launch_date` | `string (date) \| null` | ISO date `YYYY-MM-DD` |
| `risk_level` | `string \| null` | `low`, `medium`, `high`, `critical` |
| `readiness_score` | `number \| null` | 0–100 percentage |
| `product_name` | `string \| null` | Name of the associated product |

**Example**

```bash
curl -s -H "X-ClearGo-Key: $CLEARGO_AI_API_KEY" \
  "$BASE_URL/api/v1/team-members/$MEMBER_ID/epics?status=IN_PROGRESS"
```

---

### 3. Team member blockers

Returns all open blockers for epics owned by the specified team member, with escalation flags pre-computed.

```
GET /api/v1/team-members/:id/blockers
```

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `:id` | `UUID` | Team member ID |

**Response**

```json
{
  "member": {
    "id": "a1000000-0000-0000-0000-000000000002",
    "name": "Eric Guba",
    "email": "eguba@clearcompany.com"
  },
  "data": [
    {
      "id": "d1000000-0000-0000-0000-000000000002",
      "epic_id": "c1000000-0000-0000-0000-000000000005",
      "epic_name": "Database Migration Pipeline",
      "title": "Snowflake connector performance issue",
      "description": "ETL jobs timing out on large datasets, needs infra investigation",
      "severity": "critical",
      "status": "open",
      "days_blocked": 4,
      "needs_escalation": true,
      "logged_at": "2026-04-15T10:00:00.000Z"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `epic_id` | `string (UUID)` | Parent epic — use with `/api/v1/epics/:id` |
| `epic_name` | `string` | Name of the parent epic |
| `severity` | `"low" \| "medium" \| "high" \| "critical"` | Blocker severity |
| `status` | `"open" \| "resolved" \| "dismissed"` | Only `open` blockers are returned here |
| `days_blocked` | `number` | Integer days since `logged_at` (computed server-side) |
| `needs_escalation` | `boolean` | `true` when `days_blocked >= 3` AND `severity` is `high` or `critical` |
| `logged_at` | `string (ISO 8601)` | When the blocker was first logged |

**Example**

```bash
curl -s -H "X-ClearGo-Key: $CLEARGO_AI_API_KEY" \
  "$BASE_URL/api/v1/team-members/$MEMBER_ID/blockers"
```

---

### 4. 1:1 prep document

The primary endpoint. Returns a structured prep document ready for the AI to narrate — includes active work, recent wins, escalations, and rule-derived talking points.

```
GET /api/v1/1on1-prep/:person_id
```

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `:person_id` | `UUID` | Team member ID from `/api/v1/team-members` |

**Response**

```json
{
  "person": {
    "id": "a1000000-0000-0000-0000-000000000001",
    "name": "Dan Pope",
    "email": "dpope@clearcompany.com",
    "role": "PM"
  },
  "summary": {
    "active_epics": 2,
    "completed_this_week": 1,
    "open_blockers": 2,
    "escalations_needed": 1
  },
  "active_epics": [
    {
      "id": "c1000000-0000-0000-0000-000000000001",
      "name": "Launch Readiness Dashboard v2",
      "status": "IN_PROGRESS",
      "tier": "TIER_1",
      "target_launch_date": "2026-05-15",
      "risk_level": "medium",
      "readiness_score": 72,
      "product_name": "ClearGO Platform"
    }
  ],
  "completed_this_week": [
    {
      "id": "c1000000-0000-0000-0000-000000000003",
      "name": "Reporting Refresh",
      "status": "LAUNCHED",
      "tier": "TIER_3",
      "target_launch_date": "2026-04-30",
      "risk_level": "low",
      "readiness_score": 98,
      "product_name": "ClearGO Platform"
    }
  ],
  "escalations_needed": [
    {
      "blocker_id": "d1000000-0000-0000-0000-000000000001",
      "epic_id": "c1000000-0000-0000-0000-000000000002",
      "epic_name": "AI Insights Module",
      "blocker_title": "Legal review pending for AI data usage policy",
      "severity": "high",
      "days_blocked": 5
    }
  ],
  "suggested_talking_points": [
    "[ESCALATE] AI Insights Module: Legal review pending for AI data usage policy — blocked 5 days (high)",
    "Review risk on 'AI Insights Module' — currently high risk",
    "Celebrate wins: Reporting Refresh shipped this week",
    "Check readiness blockers on AI Insights Module (score: 45%)"
  ],
  "generated_at": "2026-04-19T14:32:00.000Z"
}
```

**Response fields**

`summary` — integer counters for the quick status bar:

| Field | Description |
|---|---|
| `active_epics` | Epics with status outside `LAUNCHED`, `CANCELLED`, `ARCHIVED`, `COMPLETED` |
| `completed_this_week` | Epics in `LAUNCHED` or `COMPLETED` status with `updated_at` in the last 7 days |
| `open_blockers` | Open blockers across all epics owned by this person |
| `escalations_needed` | Open blockers where `days_blocked >= 3` AND severity is `high` or `critical` |

`escalations_needed` items:

| Field | Type | Description |
|---|---|---|
| `blocker_id` | `UUID` | Blocker record ID |
| `epic_id` | `UUID` | Parent epic — use with `/api/v1/epics/:id` for detail |
| `epic_name` | `string` | Epic display name |
| `blocker_title` | `string` | Short blocker description |
| `severity` | `string` | `high` or `critical` |
| `days_blocked` | `number` | Days since the blocker was logged |

`suggested_talking_points` — ordered list of AI-ready strings generated by these rules (in priority order):

1. One entry per escalation: `[ESCALATE] {epic}: {blocker} — blocked N days ({severity})`
2. One entry per high/critical-risk active epic: `Review risk on '{epic}' — currently {risk} risk`
3. If any completed-this-week epics: `Celebrate wins: {names} shipped this week`
4. If any active epic has `readiness_score < 50`: `Check readiness blockers on {epic} (score: N%)`
5. If none of the above apply: `No critical items — discuss roadmap priorities and upcoming milestones`

**Example**

```bash
curl -s -H "X-ClearGO-Key: $CLEARGO_AI_API_KEY" \
  "$BASE_URL/api/v1/1on1-prep/$PERSON_ID"
```

---

### 5. Epic detail

Returns full detail for a single epic — owner, product, all blockers (all statuses), milestones, and a readiness criteria breakdown. Use this to drill into an epic surfaced by the prep doc.

```
GET /api/v1/epics/:id
```

**Path parameters**

| Parameter | Type | Description |
|---|---|---|
| `:id` | `UUID` | Epic ID from any of the above endpoints |

**Response**

```json
{
  "id": "c1000000-0000-0000-0000-000000000005",
  "name": "Database Migration Pipeline",
  "status": "IN_PROGRESS",
  "tier": "TIER_1",
  "target_launch_date": "2026-05-20",
  "risk_level": "critical",
  "readiness_score": 38,
  "owner": {
    "id": "a1000000-0000-0000-0000-000000000002",
    "name": "Eric Guba",
    "email": "eguba@clearcompany.com"
  },
  "product": {
    "id": "b1000000-0000-0000-0000-000000000001",
    "name": "ClearGO Platform",
    "pillar": "Core Platform",
    "pod": "Platform"
  },
  "blockers": [
    {
      "id": "d1000000-0000-0000-0000-000000000002",
      "epic_id": "c1000000-0000-0000-0000-000000000005",
      "epic_name": "Database Migration Pipeline",
      "title": "Snowflake connector performance issue",
      "description": "ETL jobs timing out on large datasets, needs infra investigation",
      "severity": "critical",
      "status": "open",
      "days_blocked": 4,
      "needs_escalation": true,
      "logged_at": "2026-04-15T10:00:00.000Z"
    }
  ],
  "milestones": [
    {
      "id": "e1000000-0000-0000-0000-000000000003",
      "name": "Performance testing",
      "due_date": "2026-04-30",
      "completed_at": null,
      "status": "missed"
    }
  ],
  "criteria_summary": {
    "total": 12,
    "go": 5,
    "no_go": 2,
    "conditional": 3,
    "not_set": 2
  }
}
```

**`blockers` array** — includes all statuses (`open`, `resolved`, `dismissed`), newest first. `needs_escalation` is only `true` for `open` blockers.

**`milestones` array** — ordered by `due_date` ascending (nulls last).

| Milestone status | Meaning |
|---|---|
| `pending` | Not started |
| `in_progress` | In flight |
| `completed` | Done |
| `missed` | Past due, not completed |

**`criteria_summary`** — counts of go/no-go readiness criteria statuses. `NOT_APPLICABLE` criteria are folded into `not_set`.

**Example**

```bash
curl -s -H "X-ClearGo-Key: $CLEARGO_AI_API_KEY" \
  "$BASE_URL/api/v1/epics/$EPIC_ID"
```

---

## Typical usage flow

For generating a 1:1 prep pack:

```
1. GET /api/v1/team-members
   → pick the person_id for the upcoming 1:1

2. GET /api/v1/1on1-prep/{person_id}
   → get the full prep document with talking points

3. For any escalation in escalations_needed:
   GET /api/v1/epics/{epic_id}
   → get blocker detail, milestones, and criteria health for deeper context
```

For a team health overview:

```
1. GET /api/v1/team-members
   → scan active_epics_count and open_blockers_count for each member

2. GET /api/v1/team-members/{id}/blockers (for anyone with open blockers)
   → check needs_escalation flags

3. GET /api/v1/team-members/{id}/epics?status=IN_PROGRESS (optional drill-down)
   → review in-flight work per person
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `CLEARGO_AI_API_KEY` | Yes | Secret key for all API calls |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (bypasses RLS for read access) |

---

## Running locally

Install Netlify CLI if you haven't:

```bash
npm install -g netlify-cli
```

Start the local dev server (runs both Next.js and Netlify Functions):

```bash
netlify dev
```

Functions are available at `http://localhost:8888/api/v1/*`.

Seed the database with sample data (Dan Pope, Eric Guba, Marcelo Paiva + epics and blockers):

```bash
npx tsx scripts/seed-ai-api-data.ts
```

Run the QA curl script against the local server:

```bash
CLEARGO_BASE_URL=http://localhost:8888 \
CLEARGO_AI_API_KEY=your-key \
TEST_MEMBER_ID=a1000000-0000-0000-0000-000000000001 \
TEST_EPIC_ID=c1000000-0000-0000-0000-000000000001 \
bash scripts/qa-ai-api.sh
```

Run the unit tests:

```bash
npm test -- --testPathPattern=netlify/functions/__tests__
```

---

## MCP Server

ClearGo also exposes the AI API as an MCP server at `POST /api/mcp`.

**Transport:** Streamable HTTP (stateless, one session per request)

**Auth:** Same `X-ClearGo-Key` header as the REST endpoints

### Available tools

| Tool | Description |
|------|-------------|
| `list_team_members` | List all direct reports with health snapshot |
| `get_1on1_prep` | Full 1:1 prep doc with talking points |
| `list_member_epics` | Epics for a team member, optional status filter |
| `list_member_blockers` | Open blockers with escalation flags |
| `get_epic_detail` | Full epic with milestones and criteria breakdown |

### Connecting from TTS (or any MCP client)

Base URL: same as the REST API (e.g. `https://cleargo.netlify.app`)

MCP endpoint: `POST /api/mcp`

Auth header: `X-ClearGo-Key: <your-key>`

The MCP server is stateless — no session management needed. Each tool call is a self-contained POST request.

### Example: list tools

```bash
curl -s -X POST https://cleargo.netlify.app/api/mcp \
  -H "X-ClearGo-Key: $CLEARGO_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -m json.tool
```

### Example: call a tool

```bash
curl -s -X POST https://cleargo.netlify.app/api/mcp \
  -H "X-ClearGo-Key: $CLEARGO_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_team_members","arguments":{}}}' | python3 -m json.tool
```
