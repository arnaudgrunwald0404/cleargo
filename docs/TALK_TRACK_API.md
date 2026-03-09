# Talk Track API

REST API to retrieve epic talk track data from ClearMAP for use in external tools.

## Endpoint

```
GET https://dqqzbkmtbnigytsfycbz.supabase.co/functions/v1/epic-talk-track-api
```

## Authentication

Requires two headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <SUPABASE_JWT>` |
| `apikey` | Your Supabase publishable key |

### Getting a JWT token

**From the browser console** (while logged into ClearMAP):

```javascript
const stored = Object.keys(localStorage).find(k => k.startsWith('sb-'));
const data = JSON.parse(localStorage.getItem(stored));
console.log(data?.access_token);
```

**Via email/password sign-in:**

```bash
curl -X POST "https://dqqzbkmtbnigytsfycbz.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: YOUR_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@company.com","password":"your-password"}'
```

The response includes an `access_token` field.

## Query Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `epic_id` | Yes | — | Aha epic reference (e.g., `APP-E-260`) |
| `status` | No | `any` | Filter narration by status. Values: `any`, `draft`, `baseline`, `recording`, `transcribing`, `summarizing`, `complete`, `error` |

## Example Request

```bash
curl "https://dqqzbkmtbnigytsfycbz.supabase.co/functions/v1/epic-talk-track-api?epic_id=APP-E-260" \
  -H "Authorization: Bearer $CLEARMAP_JWT" \
  -H "apikey: $CLEARMAP_APIKEY"
```

## Response

Always returns `200` with JSON. If no narration exists, fields are `null`.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `epicId` | `string` | Internal Aha epic ID |
| `epicRef` | `string` | Aha reference number (e.g., `APP-E-260`) |
| `epicName` | `string \| null` | Epic title from Aha |
| `narrationId` | `string \| null` | UUID of the narration record |
| `status` | `string` | Narration status: `none`, `draft`, `baseline`, `recording`, `transcribing`, `summarizing`, `complete`, `error` |
| `talkingPoints` | `string[] \| null` | Key customer-facing talking points |
| `baselineSections` | `object \| null` | Script sections (see below) |
| `keyInternalPoints` | `string[] \| null` | Internal sales/strategy points (not for customers) |
| `questions` | `array` | Q&A pairs from the "Between Us" panel (see below) |
| `videoUrl` | `string \| null` | Synthesia video playback URL |
| `videoStatus` | `string \| null` | Video generation status: `pending`, `generating`, `ready`, `failed` |
| `generatedAt` | `string \| null` | ISO timestamp of last update |

### `baselineSections` Object

The script is broken into 5 sections, each a text string:

| Key | Section Title | Description |
|---|---|---|
| `before_state` | The Before State (~30 sec) | Current pain point / status quo |
| `whats_changing` | What's Changing & Why It Matters (~60 sec) | The feature and its value |
| `who_cares_most` | Who Cares Most (~30 sec) | Target personas and use cases |
| `the_visual` | The Visual (~30 sec) | What the customer will see |
| `how_to_turn_on` | How to Turn It On (~15 sec) | Availability and enablement |

### `questions` Array

Each entry is a Q&A pair from the internal "Between Us" panel:

```json
{
  "promptKey": "target_customer",
  "question": "Which buyer role, company size, or industry will feel this most?",
  "answer": "Recruiters and hiring managers in high-volume hiring environments..."
}
```

Typical prompt keys: `target_customer`, `problem_solved`, `strategic_value`, `competitive_angle`, `timeline_confidence`

## Example Responses

### Epic with narration

```json
{
  "epicId": "aha-internal-id",
  "epicRef": "APP-E-260",
  "epicName": "Enhanced 1:1 Self-Scheduling",
  "narrationId": "a1b2c3d4-...",
  "status": "baseline",
  "talkingPoints": [
    "Enhanced 1:1 Self-Scheduling will allow candidates to book interviews using real-time availability.",
    "Interviewer Scheduling Preferences let users customize availability settings.",
    "Self-scheduling links reduce back-and-forth communication and double-booking."
  ],
  "baselineSections": {
    "before_state": "Right now, most recruiter teams are dealing with manual scheduling...",
    "whats_changing": "Enhanced 1:1 Self-Scheduling introduces a modern...",
    "who_cares_most": "Recruiters and hiring managers in high-volume hiring...",
    "the_visual": "The recruiter will see a new self-scheduling link builder...",
    "how_to_turn_on": "Available to all users; contact your CSM for early access."
  },
  "keyInternalPoints": [
    "Captures $3.5M+ in ARR by closing gaps in self-scheduling",
    "Increases adoption of 1:1 self-scheduling and AI Notetaker"
  ],
  "questions": [
    {
      "promptKey": "target_customer",
      "question": "Which buyer role, company size, or industry will feel this most?",
      "answer": "Recruiters and hiring managers in high-volume hiring environments..."
    },
    {
      "promptKey": "strategic_value",
      "question": "Think ROI, risk reduction, competitive advantage, or time saved.",
      "answer": "Captures $3.5M+ in ARR by closing gaps in self-scheduling..."
    }
  ],
  "videoUrl": "https://share.synthesia.io/...",
  "videoStatus": "ready",
  "generatedAt": "2026-03-07T14:30:00Z"
}
```

### Epic without narration

```json
{
  "epicId": "aha-internal-id",
  "epicRef": "APP-E-525",
  "epicName": "Batch SFTP",
  "narrationId": null,
  "status": "none",
  "talkingPoints": null,
  "baselineSections": null,
  "keyInternalPoints": null,
  "questions": [],
  "videoUrl": null,
  "videoStatus": null,
  "generatedAt": null
}
```

## Error Responses

| Status | Body | Cause |
|---|---|---|
| `400` | `{"error":"Missing epic_id query parameter"}` | No `epic_id` in URL |
| `401` | `{"error":"Missing authorization header"}` | No `Authorization` header |
| `404` | `{"error":"Epic not found: APP-E-999"}` | Aha reference not in database |
| `500` | `{"error":"Internal server error"}` | Unexpected server error |

## ClearGO integration

The Epic Detail **Talk track** tab fetches data via a Next.js proxy:

- **Route:** `GET /api/talk-track?epic_id=<Aha ref>` (e.g. `APP-E-260`)
- **Env (optional):** Set these in `.env` to enable the proxy:
  - `CLEARMAP_JWT` – Bearer token: either the ClearMAP **service_role** key (recommended for server-to-server; bypasses RLS) or a user `access_token` from logging into ClearMAP
  - `CLEARMAP_SUPABASE_ANON_KEY` – ClearMAP Supabase anon/publishable key

If unset or when the epic has no narration, the tab shows a link to ClearMAP:

`https://clearmap.netlify.app/talk_tracks?epic_id=<epic_ref>`

## Deployment

```bash
supabase functions deploy epic-talk-track-api
```

## Source

`supabase/functions/epic-talk-track-api/index.ts`
