# HEART Dashboard: Pendo Measurement Types & Data (from Pendo MCP)

Summary of what ClearGO/Pendo is collecting and how it maps to HEART, so we can improve the dashboard.

---

## 1. What Pendo has (ClearCompany app, sub 6021298072387584)

### Entity types we use for HEART

| Type | What it is | Used in HEART for |
|------|------------|-------------------|
| **TrackType** | Custom track events (e.g. `App.Candidate.Created.Application`) | Engagement (events per user), Task Success (start/complete events), Retention (return events) |
| **Feature** | Click/element tracking (e.g. "Recruiting - Quick Wins - Link to Job Posting - Link") | Task Success (when configured as start/complete features), Adoption (feature adoption) |
| **Page** | Page views / route groups (e.g. "Candidate Profile & Details (All)") | Happiness (frustration scoped to pages), Adoption (page-level adoption) |

- **Task Success (current epic)** uses two **Feature** IDs:  
  - "Recruiting - Quick Wins Q2, 2025 - Link to Job **Positing** - Link" (start)  
  - Same guide/card with "Copy Link" (complete)  
  So "starts" and "completions" are **feature clicks**, not track events. Having more "completions" than "starts" means the second feature was clicked more than the first—either event order in config should be swapped, or both are separate actions (not a funnel).

### Top activity (last 30 days) – good candidates for HEART metrics

**Track types (events)**  
- `App.Candidate.Created.Application` — 501K events  
- `App.User.Login` — 432K  
- `App.Candidate.Text.Sent` — 297K  
- `App.Req.Updated` — 152K  
- `App.Candidate.Email.Scheduled` — 146K  
- `App.Requisition.Synced.LinkedIn` — 114K  
- `App.Candidate.OfferLetter.Sent` — 26K  
- `App.Req.Created` — 23K  
- `App.Recruiting.BulkOnboarding.Started` / `Completed` — ~17K each  

**Pages (for frustration scope / adoption)**  
- Sitewide, CC Sitewide w/out Admin Learning — ~11M  
- Candidate Profile & Details (All) — 3.2M  
- Tool - Recruiting - All Pages — 2.6M  
- Mindy - Recruiting - Landing Page — 1.6M  

**Features (for task success / adoption)**  
- Table for Requisitions — 673K  
- Candidate Profile - Notes Tab — 387K  
- Recruiting - Candidate Profile - MOVE FORWARD — 310K  
- Recruiting - Candidate Profile - DECLINE — 272K  

---

## 2. Account & visitor metadata (for segments and clarity)

**Account** (examples): `metadata.agent.*` (product flags, org settings), `metadata.custom.*` (ARR, industry, CSM, release cohort), `metadata.salesforce.*`.  
**Visitor**: `metadata.agent.*` (email, role), `metadata.auto.*` (last visit, browser), `metadata.custom.*` (last guide).

- No segment named "HEART" exists; segments (150+) can be used to scope metrics (e.g. by release cohort or product package).
- **Product Engagement Score (PES)** for the app (Jan 20–Feb 19): adoption 7.5, stickiness 12.3, growth 51.6, PES 23.8.

---

## 3. Recommendations to improve the dashboard (status)

1. **Show entity type in Metric details** — **Done**  
   The "Tracking" line now shows each item as **Name (Page)**, **Name (Feature)**, or **Name (Track event)** (e.g. "Tracking: Recruiting - Link to Job Posting - Link (Feature), …"). The Pendo client already resolves IDs to names; we can add type from `Pendo entities` (or from the entities list) so users know what’s being measured.

2. **Task Success: Start vs Complete** — **Done**  
   When "complete" > "start", the dashboard shows the breakdown and a note: swap the two in config, or use **Track events** (Edit Metrics → Task Success → **Track Events** tab) and pick two events (e.g. `App.Recruiting.BulkOnboarding.Started` and `App.Recruiting.BulkOnboarding.Completed`) for a clear funnel. Track events are already supported in the same form (Track Events tab); no extra implementation needed.

   **What the completion % actually is:** The dashboard shows **(total "complete" events) ÷ (total "start" events)** over the period—a ratio of **event counts**, not "% of users who completed" or "% of attempts that succeeded." If users trigger the "start" action many times per session (e.g. opening a menu or panel), the ratio can be low even when most users eventually complete the task. For a funnel that better reflects "did users who started also complete?", use two **Track events** that fire once per task (e.g. Started → Completed).

3. **Engagement / Adoption** — **Guidance**  
   - Use **TrackType** for engagement (e.g. events per user for `App.Candidate.Created.Application` or `App.User.Login`).  
   - Use **Feature** or **Page** for adoption (e.g. unique visitors on a page or using a feature), and optionally segment by `metadata.custom.releasecohort` or similar.

4. **Happiness (frustration)** — **Done + optional**  
   Scoping by **Page** IDs is unchanged. When there is no scoped data, the dashboard shows an orange note: "Visitor count is app-wide (no data on selected pages)."  
   - Optionally add a Pendo segment for "HEART release cohort" and use it for frustration/visitor filters so numbers align with the release.

5. **Naming / copy** — **Pendo product**  
   ClearGO displays the name from Pendo. To fix "Link to Job **Positing**", rename the feature in Pendo to "Posting".

6. **Data consistency** — **Done**  
   Task Success description and chart both use the same 30-day `getDailyMetricTimeSeries` API, so the numbers match.

---

## 4. Quick reference: HEART → Pendo

| HEART | Typical Pendo type | Example |
|-------|--------------------|--------|
| Happiness | Page (frustration scope), Survey | LinkedIn Job Status page; frustration signals |
| Engagement | TrackType (events per user) | App.User.Login, App.Candidate.Text.Sent |
| Adoption | Feature or Page (unique users) | Candidate Profile - Notes Tab; Recruiting - All Pages |
| Retention | TrackType (return events) | Same event in two periods |
| Task Success | Feature or TrackType (start + complete) | Link / Copy Link (features); BulkOnboarding Started/Completed (track) |

---

## Chart window (7D, 1M, etc.) and card values

**All HEART metrics use the selected chart window.** When you change the timeframe (7D, 1M, 3M, etc.):

- The **API** is called with `?window=7D` (or 1M, etc.).
- **Every metric** (Happiness, Engagement, Adoption, Retention, Task Success) is fetched from Pendo using that window’s date range (`startDate`/`endDate`).
- Card values and metric details (e.g. “Last 7 days”, “Last 30 days”) match the selected window.

So 7D shows last 7 days of Pendo data; 1M shows last 30 days. You can confirm in Pendo (e.g. Activity for the same event/feature for 7D vs 30D) that counts differ by window. Example (ClearCompany app): *App.Requisition.Synced.LinkedIn* in 7D ≈ 21.8K events, 2 unique visitors; in 30D ≈ 114.6K events, 3 unique visitors.

This file was generated using Pendo MCP (list_all_applications, accountMetadataSchema, visitorMetadataSchema, searchEntities, activityQuery, productEngagementScore, segmentList).
