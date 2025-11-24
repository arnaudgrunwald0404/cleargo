# Launch Readiness Console — Implementation Plan (Living Document)

Status: Draft v0.1 (living; updated continuously as we progress)
Owner: Product Ops + Engineering
Last updated: 2025-11-22

Working rule
- We will maintain this plan in-repo and update it as we progress. All scope, tickets, and decisions will be reflected here.

Executive summary
- Goal: Replace spreadsheets with a structured Launch Readiness Console that models criteria, computes readiness/verdict, surfaces risks, syncs with Aha, and notifies stakeholders.
- Scope (v1): Data model; Portfolio + Launch Detail + My Items; matrix editing; scoring/verdict/risk; email reminders and digests; Aha webhook sync + write-back on status change; auth without SSO; RBAC; audit; admin settings.

Key decisions (confirmed)
- Auth: Native Supabase Auth (Google OAuth). Replaces custom magic links.
- Email provider: Resend.
- Allowlist: Only @clearcompany.com emails can receive magic links.
- Aha: Canonical mapping doc exists at docs/launch-readiness/aha-launch-console-mapping.yaml.
- Aha integration: Inbound via webhook with filter ((Launch Candidate == true) OR tag "LaunchConsole"); write-back fields (Status, Score %, Risk, Go/No-Go Date, Console URL) triggered on readiness recompute and decision snapshot; idempotent updates only when changed.
- Readiness thresholds: Configurable per tier (T1/T2/T3) via Admin Settings.
- Owner resolution: Product/pod roster determines decision owners; Product Ops fallback user: agrunwald@clearcompany.com.
- Pillar/pod taxonomy: Fixed and owned in Aha (synced to console).
- Admin Settings: Required in v1 (thresholds, staleness, digests, allowlist, etc.).
- Seed criteria: Import from docs/launch-readiness/Launch Readiness Matrix Template.xlsx.

Open items resolved (defaults set)
- Staleness window: 14 days.
- Leadership digest schedule: Mondays 09:00 (company HQ time zone).
- Time zone: Company HQ time zone.
- Email sender address for auth and digests: noreply@tacticalsync.com.

Architecture overview
- Frontend: React + TypeScript + Vite + Mantine UI.
- Backend: Node/TypeScript (API + jobs) or Supabase functions.
- Database: Postgres (Supabase). Migrations + seed scripts.
- Jobs: Scheduled workers; Aha webhook listener; email senders.
- Auth: Native Supabase Auth (Google OAuth).
- Integrations: Aha (webhook in, write-back out), Resend (email).

Data model (summary)
- user(id, name, email, role, is_active, slack_handle?)
- product(id, name, pillar, pod, owner_id)
- launch(id, aha_id, aha_url, name, product_id, product_component?, pod?, tier, target_launch_date, status, readiness_status, readiness_score, risk_level, last_go_no_go_decision_date?, console_url?, owner_id, owner_email?, tags, business_priority, csm_priority)
- criterion(id, label, description, category, gate, tier_applicability, decision_owner_role, status_definitions, sort_order, is_active)
- launch_criterion_status(id, launch_id, criterion_id, status, notes, condition, condition_type, condition_due_date, condition_owner_id, decision_owner_id, last_updated_at, last_updated_by, score_value)
- decision_snapshot(id, launch_id, taken_at, decision_type, verdict, notes, created_by, snapshot_data)
- notification_log(id, user_id, type, payload, sent_at, delivery_channel, status)
- audit_log(id, actor_id, entity_type, entity_id, taken_at, json_diff)
- settings(id, per-tier-thresholds, staleness_days, digest_schedule, allowlisted_domains, fallback_user_email, timezone, aha_webhook_secret, email_sender)
- roster(id, product_id, pod, role → user_id mapping)

Permissions & roles
- Roles: CPO, PRODUCT_LEAD, PM, PMM, ENG_LEAD, SUPPORT_LEAD, SECURITY, LEARNING, PRODUCT_OPS, OTHER.
- Read access: all authenticated users to portfolio and launch detail.
- Edit: Launch owner, Product Ops, CPO for launch metadata. Criterion status: decision_owner and Product Ops.
- Criteria configuration + settings: Product Ops & CPO.

Readiness, verdict, risk (v1 rules)
- Scoring: GO=2, CONDITIONAL=1, NO_GO=0, NOT_SET=null. Exclude NOT_SET. Exclude gate criteria from score denominator.
- Verdict precedence: any gate NO_GO → NO_GO; else unresolved pre-launch conditions on gates → CONDITIONAL; else tier thresholds (configurable per tier); manual override with reason.
- Risk: Based on days_to_launch vs thresholds/readiness; HIGH if close to launch and below thresholds or gates not GO; MEDIUM if moderately below and approaching; else LOW.

Views & UX
- Portfolio Dashboard: table of launches; filters: tier, pillar, pod, owner, status, timeframe; sorts by date/risk/readiness.
- Launch Detail: header (name, product, tier, dates, status, readiness, risk, gate counts); matrix grouped by category; inline edits with role-based permissions; snapshot action.
- My Items: user-centric list of all owned criteria (decision_owner or condition_owner), due dates, overdue flags.
- Audit: admin viewer with filters and CSV export (MVP).

Notifications (email via Resend)
- Stale Criterion Reminder: last_updated_at older than staleness_days (default 14) and status != GO; nightly.
- Weekly Leadership Digest: top N by tier/risk/days; schedule configurable (default Monday 09:00); recipients: CPO/Product Leads.
- Upcoming Launch Risk Alert: covered in digest for MVP; optional extra job later.

Aha integration
- Inbound: Webhook endpoint verifies secret; upserts launches using canonical mapping at docs/launch-readiness/aha-launch-console-mapping.yaml.
  - Filter: include epics in allowed workspaces where (Launch Candidate == true) OR (tags contains "LaunchConsole").
  - Map: tier, GA date, owner (by email), product/pod/pillar, product_component; create missing Products and maintain taxonomy.
  - On first sync of a new Launch: instantiate all applicable Criteria with NOT_SET.
- Backfill: one-time import job for existing epics (idempotent).
- Outbound write-back (idempotent): only when values change, triggered on readiness recompute and decision snapshot creation.
  - Fields written back to Aha: "Launch Readiness Status", "Launch Readiness Score %", "Launch Risk", "Launch Go/No-Go Date", "Launch Console URL".
  - Console URL format: https://launch-console.clearcompany.com/launch/{launch.id}
  - Retries with backoff on transient errors.

Admin Settings (v1 must-have)
- Per-tier thresholds (T1/T2/T3)
- Staleness window (days)
- Digest schedule (day/time)
- Email allowlist domains (default: ["clearcompany.com"])
- Fallback Product Ops user (default: agrunwald@clearcompany.com)
- Time zone (for jobs)
- Aha webhook secret (rotated)
- Email sender identity (Resend)

Environment & secrets (current)
- RESEND_API_KEY: Resend API key (server)
- EMAIL_SENDER: Default sender (noreply@tacticalsync.com)
- MAGIC_LINK_SECRET: HS256 secret for JWT links and sessions
- NEXT_PUBLIC_APP_URL: Base app URL for magic links
- ALLOWLIST_DOMAINS: Comma-separated domains (e.g., clearcompany.com)
- FALLBACK_PRODUCT_OPS_EMAIL: Default Product Ops fallback (agrunwald@clearcompany.com)
- AHA_WEBHOOK_SECRET: Shared secret to validate Aha webhooks
- COMPANY_TIMEZONE: IANA TZ (e.g., America/New_York)
- DIGEST_SCHEDULE: Weekly schedule token (e.g., MON_09_00)

End-user education — how to use the console
1) For Product Managers (PMs)
- Create or locate your Launch (auto-synced from Aha; otherwise create manually and link aha_id).
- Review auto-instantiated criteria; assign decision owners where unresolved; add dates for your timeline.
- Update statuses as evidence becomes available; avoid NOT_SET beyond T-90; attach notes for context.
- Use the header readiness bar and gate counts to track progress; aim to clear gate NO_GOs early.
- Before Go/No-Go, take a Snapshot; capture verdict and notes.

2) For Decision Owners (Eng/Sec/Support/PMM/etc.)
- Open My Items to see everything assigned to you across launches.
- For any Conditional Go, you must provide: condition text, type (pre-launch/T+30/T+90), due date, and condition owner.
- Keep items fresh; you’ll get reminders if they’re stale beyond the staleness window.

3) For Product Ops (Admins)
- Configure Criteria templates (labels, categories, gates, tier applicability, decision owner role).
- Import/update criteria from Launch Readiness Matrix Template.xlsx when the framework changes.
- Maintain Admin Settings: thresholds, staleness, digest schedule, allowlist, fallback user.
- Manage roster (map product/pod roles to users) for owner resolution.
- During Go/No-Go: run the launch detail view, review gates, take Snapshot, log decision and notes.

4) For Leadership (CPO/Product Leads)
- Use Portfolio to sort by risk, readiness, and days to launch.
- Scan digest emails for high-risk Tier 1/2 launches; click through for details.
- In Launch Detail, review gate blockers and unresolved conditions before approving a Go.

Go/No-Go meeting checklist
- Portfolio pre-read sorted by risk; identify at-risk launches.
- Launch Detail: verify gates; check readiness against tier threshold; confirm unresolved conditions and owners.
- Create Snapshot with decision type GO_NO_GO_MEETING; set verdict and notes.
- If Conditional Go, ensure conditions have owners and due dates.

Phasing and milestones
- M1 Foundations (auth, RBAC, DB)
- M2 Launch CRUD + criteria instantiation
- M3 Scoring/verdict/risk + Portfolio + My Items
- M4 Aha webhook + write-back + email notifications
- M5 Snapshots + audit + performance & security hygiene
- M6 Testing, UX polish, documentation, UAT

Epics, user stories, and tickets (with acceptance criteria)
- E1 Platform foundations (Auth without SSO, RBAC, env)
  - T1.1 Supabase Auth (Google)
    - AC: Google OAuth provider configured; RLS policies for authenticated users.
  - T1.2 RBAC scaffolding
    - AC: Roles enforced; admin seed for Product Ops/CPO.
- T1.3 Envs & secrets
    - AC: Dev/Staging/Prod configured; RESEND_API_KEY set.
- E2 Data model and migrations
  - T2.1 Schema + migrations (incl. settings, roster)
    - AC: All FKs, constraints, indexes for portfolio queries.
  - T2.2 Seed data
    - AC: Products baseline, Product Ops admin, default thresholds (T1 0.90 / T2 0.80 / T3 0.70), staleness 14d.
- E3 Criteria configuration (Admin UI)
  - T3.1 Criteria CRUD (list/filter/create/edit/activate/deactivate)
  - T3.2 Tier applicability and decision owner role controls
  - T3.3 Criteria import from XLSX (Template.xlsx), dry-run preview, idempotent
- E4 Launch CRUD and matrix instantiation
  - T4.1 Launch Create/Edit/Cancel
  - T4.2 Auto-instantiation of criteria (tier filters; NOT_SET)
  - T4.3 Derived fields (gate counts, days_to_launch)
- E5 Matrix editing, validation, scoring, verdict, risk
  - T5.1 Matrix editing UI + permissions
  - T5.2 Conditional validation
  - T5.3 Readiness scoring
  - T5.4 Verdict engine + risk (config per-tier thresholds; manual override)
  - T5.5 Audit hooks
- E6 Portfolio, Launch Detail, My Items
  - T6.1 Portfolio Dashboard (filters, sorts, perf ≤2s @ ≤100 launches)
  - T6.2 Launch Detail (grouped matrix, inline edits)
  - T6.3 My Items (overdue indicators)
- E7 Decision snapshots and logging
  - T7.1 Snapshot creation (serialize state)
  - T7.2 Snapshot list + read-only view
- E8 Notifications (Resend)
  - T8.1 Resend integration (emails, logs)
  - T8.2 Stale criterion reminder (uses staleness_days)
  - T8.3 Weekly leadership digest (configurable schedule)
- E9 Aha integration (webhook + write-back)
  - T9.1 Webhook endpoint (verify secret, upsert, mapping doc)
    - AC: Secret verified; allowed workspaces enforced; filter: (Launch Candidate == true) OR (tags contains "LaunchConsole"); idempotent upsert.
  - T9.2 Initial backfill job (idempotent)
    - AC: Imports historical epics matching filter; safe to re-run; respects mapping doc.
  - T9.3 Owner resolution via roster; Product Ops fallback if unresolved
    - AC: Aha assigned_to_user email → existing User by email; if none, assign fallback Product Ops; audited.
  - T9.4 Console URL derivation
    - AC: console_url computed and stored; exposed in UI; matches format.
  - T9.5 Write-back payload + idempotency
    - AC: Writes fields: Readiness Status, Readiness Score %, Risk, Go/No-Go Date, Console URL; only sends when values changed since last sync; retries with backoff.
  - T9.6 Mapping keys confirmation and tests
    - AC: All Aha field_label → custom_field_key values filled (remove TODOs); config-driven; unit tests for inbound mapping (tier, dates, owner, pod/component) and write-back triggers.
- E10 Audit & admin views
  - T10.1 Admin audit viewer (filters, CSV)
- E11 Performance, security hygiene, observability
  - T11.1 Indexing & profiling
  - T11.2 Security hygiene (HTTPS, CSRF, input validation, rate limiting)
  - T11.3 Job/API error handling + alerts
- E12 Testing & QA
  - T12.1 Unit tests (scoring, verdict, risk)
  - T12.2 Integration tests (webhook, write-back, email)
  - T12.3 E2E paths
- E13 UX polish & adoption
  - T13.1 Mantine design pass & accessibility
  - T13.2 Onboarding helpers, tooltips, empty states
  - T13.3 Docs for Admins, PMs, Leadership

Database migrations
- SQL migrations: db/migrations/0001_initial.sql
- Seeds: db/seeds/0001_seed.sql
- Apply: use your Postgres/Supabase migration process; for Supabase CLI: supabase db push or supabase db reset; for direct Postgres: psql -f db/migrations/0001_initial.sql then psql -f db/seeds/0001_seed.sql

API surface (MVP)
- Auth: POST /api/auth/magic-link, POST /api/auth/verify, POST /api/auth/signout
- Users: GET /api/users/me
- Products: GET/POST/PATCH /api/products
- Criteria: GET/POST/PATCH /api/criteria
- Settings (Admin): GET/PATCH /api/settings
- Roster (Admin): GET/POST/PATCH /api/roster
- Launches: GET/POST/PATCH /api/launches, GET /api/launches/:id
- LaunchCriterionStatus: PATCH /api/launches/:id/criteria/:lcsId
- Snapshots: POST /api/launches/:id/snapshots, GET /api/launches/:id/snapshots
- Portfolio: GET /api/portfolio?filters
- My Items: GET /api/my-items
- Aha webhook: POST /api/integrations/aha/webhook (secret-verified)

Delivery sequence (sprints)
- Sprint 1: E1, E2 (auth, RBAC, schema, seeds)
- Sprint 2: E3, E4 (criteria admin + launch CRUD/instantiation)
- Sprint 3: E5, E6 (matrix, scoring, verdict, risk, portfolio, my items)
- Sprint 4: E9, E8 (Aha webhook/backfill/write-back; Resend + reminders + digest)
- Sprint 5: E7, E10, E11 (snapshots, audit view, perf/security/observability)
- Sprint 6: E12, E13 (tests, polish, docs, UAT)

Immediate next tickets
1) T1.1 Supabase Auth (Google) — Done (Replaced NextAuth/Resend with Native Supabase Auth).
2) T1.2 RBAC scaffolding — Done (role resolver with file-based overrides and fallback Product Ops).
3) T2.1 Schema + migrations (incl. settings, roster) — Done (db/migrations/0001_initial.sql created).
4) T2.2 Seed data — Done (db/seeds/0001_seed.sql with defaults and fallback user).
5) T3.1 Criteria CRUD — Done (Admin UI page at /admin/criteria; list/create/edit; role-gated; connected to Supabase DB).
6) Admin Settings UI — Done (Page at /admin/settings; reads/writes to app_settings table; RBAC checks).
7) T3.3 Criteria import from XLSX

Change log
- v1.1 (2025-11-23): Completed Admin Settings UI (/admin/settings) and API. Moved settings source of truth to DB.
- v1.0 (2025-11-23): Migrated to Native Supabase Auth (Google); removed NextAuth.js. Automated DB schema & RLS application via Supabase CLI. Connected Criteria CRUD to Supabase DB.
- v0.9 (2025-11-22): Completed T3.1 — Criteria Admin UI (/admin/criteria), API (GET/POST/PATCH), validation, and role gating. Temporary file-backed store; will switch to DB repo.
- v0.8 (2025-11-22): Added DB migration and seed SQL (T2.1, T2.2) and documented apply steps.
- v0.7 (2025-11-22): Finished T1.3 (env & secrets): added AHA_WEBHOOK_SECRET, FALLBACK_PRODUCT_OPS_EMAIL, COMPANY_TIMEZONE, DIGEST_SCHEDULE; documented settings.
- v0.6 (2025-11-22): Completed T1.1 (logout endpoint added) and T1.2 (RBAC scaffolding with role resolver and fallback). Home now displays resolved role and signout button.
- v0.5 (2025-11-22): Updated default EMAIL_SENDER to noreply@tacticalsync.com.
- v0.4 (2025-11-22): Switched email provider to Resend — updated env var, helper library, plan references.
- v0.3 (2025-11-22): Started T1.1 — added package.json, Next config, env template, magic-link API, verify route, login and home pages, Resend helper, temporary token store.
- v0.2 (2025-11-22): Defaults set (staleness=14d, digest=Mon 09:00 HQ TZ, sender=noreply@clearcompany.com); added “resolved defaults” section.
- v0.1 (2025-11-22): Initial plan created with decisions (allowlist, fallback user, admin settings, Aha webhook/write-back).
