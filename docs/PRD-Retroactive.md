# ClearGO Launch Readiness Console - Product Requirements Document (Retroactive)

**Version:** 1.1  
**Date:** February 2026  
**Status:** Production  
**Document Type:** Retroactive PRD (Generated from Implementation)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Overview](#product-overview)
3. [Problem Statement](#problem-statement)
4. [Goals & Success Metrics](#goals--success-metrics)
5. [Target Users & Personas](#target-users--personas)
6. [Core Features](#core-features)
7. [Technical Architecture](#technical-architecture)
8. [Data Model](#data-model)
9. [User Flows](#user-flows)
10. [Integrations](#integrations)
11. [Security & Permissions](#security--permissions)
12. [Non-Functional Requirements](#non-functional-requirements)
13. [Delegation](#delegation)
14. [Future Enhancements](#future-enhancements)

---

## Executive Summary

**ClearGO** (Launch Readiness Console) is an internal web application designed to replace spreadsheet-based launch readiness management with a structured, intelligent control tower for product launches. The system manages launch readiness across ~15 products/pods, automatically calculates readiness scores, enforces gating rules, integrates with Aha! for roadmap synchronization, and provides real-time visibility into launch status and risks.

**Key Value Propositions:**
- Single source of truth for launch readiness across all products
- Automated readiness scoring and risk assessment
- Real-time collaboration and stakeholder accountability
- Integration with existing tools (Aha!, Slack, Google Calendar, ROVO)
- Historical tracking and audit capabilities

---

## Product Overview

ClearGO is a single-tenant internal web application built for ClearCompany's product and GTM organization. It models the traditional "Go / Conditional Go / No Go" launch readiness matrix in a structured database, automatically computes readiness scores, highlights risks, enforces gating criteria, and keeps stakeholders informed through automated notifications.

### Product Name
**ClearGO** (Launch Readiness Console)

### Product Type
Internal B2B SaaS Web Application

### Target Market
ClearCompany Product & GTM Organization (~50-100 users)

---

## Problem Statement

ClearCompany runs multiple product launches and feature releases in parallel across ~15 products/pods. Previously, launch readiness was managed via spreadsheet-based "Go / Conditional Go / No Go" matrices, filled in by various stakeholders and manually reviewed in GTM/roadmap meetings.

### Core Problems Solved

1. **No Real-Time Visibility**: No consistent, real-time view of launch readiness across products
2. **Late Risk Discovery**: Gating criteria (security, support readiness, migration) often discovered too late (within weeks of target dates)
3. **Stale Data**: Stakeholders forget to update statuses; matrices become stale
4. **No Decision History**: Launch decisions (why we went Go/Conditional/No Go) aren't logged cleanly
5. **Tool Fragmentation**: Aha! is the roadmap source of truth, but launch readiness lived outside it
6. **Manual Processes**: Everything required manual spreadsheet policing and ad-hoc reminders

---

## Goals & Success Metrics

### Primary Goals

1. **Single Source of Truth**: Provide a single, living view of launch readiness across all active launches
2. **Automated Intelligence**: Enforce consistent Go/Conditional Go/No Go logic with gating criteria and tier-specific rules
3. **Early Risk Detection**: Make risks obvious early via alerts, reminders, and simple scoring
4. **Tool Integration**: Integrate with Aha! to pull launchable epics and push back summary status
5. **Stakeholder Accountability**: Support T-based milestones (T-90, T-30, T+30, T+90) and flag misalignment
6. **Decision Support**: Serve as the canonical tool for Go/No-Go decision meetings and post-launch reviews

### Success Metrics

- **Adoption**: 100% of active launches tracked in ClearGO (vs. spreadsheets)
- **Timeliness**: 90% of criteria updated within staleness window (14 days)
- **Risk Reduction**: 50% reduction in late-stage launch blockers discovered
- **Efficiency**: 30% reduction in time spent in Go/No-Go meetings
- **Integration**: 100% of Aha! launch candidates automatically synced

---

## Target Users & Personas

### 1. CPO / Executive Leadership (Arnaud, CEO, CFO)
**Needs:**
- Single view of major launches, risks, and readiness
- High-level portfolio visibility
- Weekly digests

**Use Cases:**
- Quarterly/monthly reviews
- GTM council meetings
- Strategic launch planning

### 2. Senior Director of Product / Product Leadership (Dan + pod leads)
**Needs:**
- Oversight of launches across pods
- Risk identification and prioritization
- Roadmap alignment

**Use Cases:**
- Weekly portfolio reviews
- Risk assessment
- Resource allocation decisions

### 3. Product Managers (per product/epic)
**Needs:**
- Own launch readiness for their epics/themes
- Coordinate with PMM, Eng, Support
- Clear checklist and visibility into blockers

**Use Cases:**
- Daily launch management
- Criteria status updates
- Go/No-Go preparation

### 4. Product Marketing / GTM Leads
**Needs:**
- GTM readiness criteria ownership
- Launch timeline visibility
- Stakeholder coordination

**Use Cases:**
- Marketing readiness updates
- Launch communication planning
- Post-launch feedback collection

### 5. Engineering Leads / Security / Support Leads
**Needs:**
- Technical readiness criteria ownership
- Gate criteria enforcement
- Risk assessment input

**Use Cases:**
- Security review completion
- Support readiness verification
- Technical blocker identification

### 6. Product Ops (Admins)
**Needs:**
- System configuration and maintenance
- Criteria template management
- User and permission management

**Use Cases:**
- Criteria import/configuration
- Settings management
- User onboarding

---

## Core Features

### 1. Epic/Launch Management

#### 1.1 Epic Portfolio View
- **Grid/List View**: Display all epics with key metrics
- **Releases list (`/epics`)**: The epics table includes three adjacent date columns — **Internal Orgs** (internal rollout milestone: computed from Admin release-schedule or UI-rollout stages to match the epic timeline, or overridden by the Aha! custom field *Phase 4b: Internal Readiness Distributed* when present), **Cohort 1** (effective Cohort 1 go-live: `target_launch_date` unless the Aha! custom field *off_schedule_release_date* is set, in which case that date is used for scheduling logic and shown with a yellow highlight and tooltip “Scheduled release date”), and **GA** (`scheduled_ga_dev_date` when set, otherwise the release train’s Cohort 2 date from `release_schedule` — `cohort2_date` or the next release’s `launch_date` — with fallback to effective Cohort 1 + 28 calendar days; same rules as release status logic). The same effective Cohort 1 date and highlight apply on epic detail, home “My items”, success dashboards, and Slack notifications that reference cohort / launch timing.
- **Filtering**: By tier (TIER_1, TIER_2, TIER_3), status, risk level, release, product, pod
- **My Scope Filter**: Filter to epics where the user is the decision owner of at least one criterion
- **Sorting**: By date, risk, readiness score, name
- **Search**: Full-text search across epic names
- **Release Grouping**: Group epics by release schedule
- **Visual Indicators**: Color-coded risk levels, readiness scores, gate status

#### 1.2 Epic Detail Page
- **Header Information**: Name, product, tier, dates, status, readiness score, risk level
- **Readiness Matrix**: Interactive matrix of all criteria grouped by category
- **Gate Summary**: Count of gate criteria by status (GO/CONDITIONAL/NO_GO/NOT_SET)
- **Timeline View**: T-based milestones (T-90, T-30, T+30, T+90)
- **Owner Information**: Epic owner, decision owners per criterion
- **Aha! Integration**: Link to Aha! epic, sync status
- **Jira Integration**: Jira epic key linking and ticket tracking
- **Archived Status**: Epics are automatically archived/unarchived based on ClearGO candidate status
- **Comments & Attachments**: Per-criterion discussion and file attachments
- **Ideas & feedback**: Global Feedback page embeds the Aha! Ideas in-app widget (JWT-authenticated); submissions flow to Aha! Ideas
- **Activity History**: Timeline of all changes

#### 1.4 Epic Archiving
- **Automatic Archiving**: Epics are automatically archived when the `cleargo_candidate` custom field in Aha! is not "Yes" or "Yes - UI Framework"
- **Automatic Unarchiving**: Epics are automatically unarchived when `cleargo_candidate` becomes "Yes" or "Yes - UI Framework"
- **Archived Filter**: Archived epics are filtered out from the main epic list view by default
- **Database Field**: `archived` (Boolean, default: false) - tracks whether an epic is archived
- **Index**: Indexed for efficient filtering of archived epics
- **Sync Behavior**: Archiving status is updated during Aha! sync operations

#### 1.5 Portfolio Page
- **Route**: Dedicated `/portfolio` page for Go/No-Go and post-launch epic tracking
- **Content**: Combines **Epic Release Grid** (releases as columns, epics as rows with readiness status), **Post-Launch Performance Grid** (launched epics with feedback/performance indicators), and optional **Activity Feed** sidebar (when enabled in settings)
- **Layout**: Full-width grid section with sticky activity feed on large screens; responsive for mobile/tablet
- **Purpose**: Single portfolio view across pre-launch and post-launch with consistent release grouping and activity visibility

#### 1.3 Epic Creation & Editing
- **Manual Creation**: Create epics directly in ClearGO
- **Aha! Sync**: Automatic creation from Aha! webhooks
- **Bulk Import**: Import epics from Aha! via sync API
- **Field Mapping**: Comprehensive mapping from Aha! custom fields
- **Release Assignment**: Link epics to release schedule
- **Owner Assignment**: Assign epic owners and decision owners
- **Product Manager Resolution**: Automatic resolution of product manager based on epic ownership and pod mapping

### 2. Readiness Matrix

#### 2.1 Criteria Management
- **Criteria Templates**: Admin-configurable criteria with:
  - Label and description
  - Category (Security, Support, Marketing, etc.)
  - Gate status (blocking vs. non-blocking)
  - Tier applicability (TIER_1, TIER_2, TIER_3, ALL)
  - **UI Framework only**: When set, the criterion applies only to epics with ClearGO Candidate = "Yes - UI Framework" in Aha (e.g. UI Framework rollout-specific steps); configurable in Admin → Settings → Criteria
  - Decision owner role
  - Status definitions (GO/CONDITIONAL/NO_GO)
  - Sort order
- **Auto-Instantiation**: Criteria automatically instantiated for new epics based on tier and ClearGO Candidate value (UI Framework-only criteria only for "Yes - UI Framework" epics)
- **Status Definitions**: Custom definitions per criterion for what constitutes GO/CONDITIONAL/NO_GO
- **Import/Export**: Import criteria from Excel template

#### 2.2 Matrix Interaction
- **Traffic Light Interface**: Visual GO (green) / CONDITIONAL (yellow) / NO_GO (red) / NOT_SET (gray) status selection
- **Inline Editing**: Update status directly in matrix view
- **Conditional Go Management**: 
  - Condition text
  - Condition type (pre-launch, T+30, T+90)
  - Condition due date
  - Condition owner
- **Notes & Context**: Rich text notes per criterion status
- **Delegation**: Delegate criterion ownership to other users
- **Comments**: Threaded comments per criterion
- **Comment Requirement**: When a criterion is rated **CONDITIONAL** or **NO_GO**, the UI enforces adding a comment before closing the criterion drawer (prominent warning banner)
- **File Attachments**: Attach files to criteria for evidence
- **Snippets**: Link meeting transcript snippets to criteria

#### 2.3 Readiness Scoring
- **Automated Calculation**: 
  - GO = 2 points
  - CONDITIONAL = 1 point
  - NO_GO = 0 points
  - NOT_SET = excluded from calculation
  - Gate criteria excluded from denominator
- **Readiness Percentage**: Calculated as (sum of scores) / (number of set criteria) * 100
- **Tier-Specific Thresholds**: Configurable thresholds per tier (default: T1=90%, T2=80%, T3=70%)
- **Verdict Logic**:
  - Any gate NO_GO → NO_GO verdict
  - Unresolved pre-launch conditions on gates → CONDITIONAL
  - Readiness score below tier threshold → CONDITIONAL
  - Readiness score meets threshold → GO
  - Manual override with reason

#### 2.4 Risk Assessment
- **Risk Levels**: LOW, MEDIUM, HIGH
- **Risk Calculation**:
  - HIGH: Close to launch and below thresholds OR gates not GO
  - MEDIUM: Moderately below thresholds and approaching launch
  - LOW: On track and above thresholds
- **Days to Launch**: Automatic calculation from target launch date
- **Visual Indicators**: Color-coded risk badges throughout UI

#### 2.5 AI Checklist Pruning (Human-in-the-Loop)
- **Trigger**: When criteria are instantiated for a new epic, an AI analysis runs (if `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` is set).
- **Analysis**: The model (Gemini) reviews epic name, description, and tags and suggests which criteria may be irrelevant for that specific launch (e.g., internal-only vs public, maintenance vs new feature, geographic scope).
- **Storage**: Suggestions are stored on `epic_criterion_status` as `ai_prune_suggested` (boolean) and `ai_prune_reason` (text).
- **UI**: The Readiness tab shows an **AI Checklist Suggestions** banner when any criterion has a suggestion. Users can:
  - View the list of suggested items and reasons.
  - **Approve & Mark N/A**: Mark those criteria as N/A and clear the suggestion flags.
  - **Dismiss All**: Clear suggestion flags and keep criteria as-is.
- **Implementation**: `src/lib/ai/client.ts` (`pruneCriteria`), `src/lib/db/epics.ts` (during instantiation), `src/components/epic/AIPruneReviewBanner.tsx`.

### 3. Release Schedule Management

#### 3.1 Release Schedule
- **Release List**: View all releases with launch dates
- **Release Creation**: Create releases manually or sync from Aha!
- **Epic Grouping**: Group epics by release for portfolio view
- **Archive Releases**: Archive completed releases
- **Release Dates**: Track planned vs. actual launch dates
- **Epic Counts**: Show number of epics per release
- **Aha! Epic Count Caching**: Cache total epic count from Aha! per release to avoid repeated API calls
- **Count Refresh Tracking**: Track when Aha! epic count was last fetched and cached
- **Past Releases Management**: 
  - Filter view for releases with launch dates before today
  - Multiselect checkboxes for batch operations
  - Select All functionality for quick selection
  - Batch delete for multiple past releases at once
  - Visual highlighting of selected releases
- **Sync from Aha with Date Filter**: 
  - Date picker modal for selecting starting date when syncing releases
  - Only syncs releases with launch dates on or after selected date
  - Defaults to today's date
  - Uses "Releases date (external)" as primary date source (falls back to end_date, then start_date)

#### 3.2 Release Grid View
- **Visual Grid**: Releases as columns, epics as rows
- **Status Indicators**: Color-coded readiness status per epic
- **Filtering**: Filter by release, tier, status
- **Sorting**: Sort releases by date, epic count

### 4. Post-Launch Performance Tracking

#### 4.1 Post-Launch Grid
- **Performance Grid**: Visual grid of post-launch epics (LAUNCHED status)

### 5. Success Measurement (Post-Launch Tracking)

#### 5.1 Success Configuration
- **Draft and Publish**: Success metrics are configured in **draft** by users with Configure Success Metrics permission (CPO, Product, Product Ops). Only they see the full configuration until they **Publish**. Once published, all users can see the success metrics. PMs can **Unpublish** to return to draft (visible only to configurers again).
- **"In Progress" for Other Users**: When success metrics are in draft, other users see a message that metrics are being configured by the product team and will appear once published.
- **Benchmark Selection**: PMs select adoption benchmarks matching epic tier (TIER_1, TIER_2, TIER_3)
- **Metric Mapping**: PMs select 3-7 success metrics to track (adoption, revenue, retention, enablement, friction)
- **Post-Launch Owner Assignment**: Assign post-launch owner responsible for monitoring
- **Delegated Post-Launch Owner**: Delegate post-launch owner responsibility to another user (similar to criterion delegation)
- **Per-Metric Targets**: For each selected metric, PMs configure an epic-specific target value that represents success for that launch (e.g., activation %, DAU/MAU, MRR change)
- **Per-Metric Event/Data Sources**: For each epic metric, PMs or admins configure how the metric is measured:
  - Pendo event ID for product analytics–sourced metrics
  - Snowflake SQL query for data warehouse–sourced metrics
  - Manual label/description for metrics that are manually updated
- **Config Locking**: Auto-locks when epic status becomes "GO" (prevents changes except by admins)
- **Admin Override**: Admins can modify locked configs with audit logging

#### 5.2 Success Scorecards
- **Daily Snapshots**: Automated daily scorecard generation for launched epics with locked configs
- **Active Window**: Scorecards are considered active from T-90 days before target launch date through T+120 days after launch. Outside this window, scorecards are not generated by the active-window jobs.
- **Metric Tracking**: Tracks actual vs expected values for each configured metric
- **Status Calculation**: Overall status (ON_TRACK, AT_RISK, MISSED) based on metric performance versus configured per-epic targets and (optional) tier thresholds
- **Data Sources**: Integrates with Pendo, Snowflake, and manual entry
- **Alerts**: Automatic alerts when scorecard status is AT_RISK or MISSED
- **Metric Configuration History**: Each epic metric maintains a history of metric additions/removals, target changes, and event configuration updates for auditability

#### 5.3 Retrospectives
- **Auto-Creation**: Retro placeholders automatically created at T+30, T+60, T+90 days post-launch
- **Structured Forms**: T+30/60/90 retro forms with outcome, blockers, assumptions, action items
- **Submission Rules**: Requires recent scorecard snapshot (within 7 days) before submission
- **Reminders**: Automated reminders 3 days before retro due dates
- **Escalation**: Alerts for retros overdue by 7+ days

#### 5.4 Review Tracking
- **Mark as Reviewed**: PMs can mark scorecards as reviewed
- **Review History**: Tracks when scorecards were reviewed by whom
- **Weekly Reminders**: Automated reminders for epics not reviewed in 7+ days
- **Escalation**: Escalation alerts for epics not reviewed in 14+ days

#### 5.5 Admin Management
- **Metric Catalog**: Admins can create/edit success metrics with thresholds and data sources
- **Pendo Integration**: Admin configuration for Pendo API integration; optional dashboard URL for HEART external link
- **Settings UI**: Admin pages for managing success metrics, scorecards, and integrations
- **Feedback Metrics**: Track feedback count per epic
- **Performance Indicators**: 
  - Green: 5+ feedback items (high engagement)
  - Yellow: 2-4 feedback items (moderate engagement)
  - Red: 1 feedback item (low engagement)
  - Gray: 0 feedback items (no feedback)
- **Time Window**: Track epics launched within last 180 days
- **Release Grouping**: Group by release schedule

#### 5.6 Standard Metrics and Thresholds

The system includes 10 pre-configured success metrics based on industry-standard SaaS metrics for software launches:

**ADOPTION Metrics:**
1. **Feature Activation Rate** - Percentage of users who activate/use a new feature
   - Typical ranges: 20-40% within 30 days, 40-60% within 90 days
   - Tier thresholds: TIER_1 (60%), TIER_2 (45%), TIER_3 (25%)
   - Leading indicator

2. **Time to First Value (TTFV)** - Days until user achieves first meaningful outcome
   - Typical ranges: 1-7 days for simple features, 7-30 days for complex features
   - Tier thresholds: TIER_1 (max 3 days), TIER_2 (max 7 days), TIER_3 (max 14 days)
   - Leading indicator

3. **Daily Active Users / Monthly Active Users (DAU/MAU)** - Engagement frequency ratio
   - Typical ranges: 20-40% DAU/MAU ratio indicates strong engagement
   - Tier thresholds: TIER_1 (40%), TIER_2 (30%), TIER_3 (20%)
   - Leading indicator

**REVENUE Metrics:**
4. **Monthly Recurring Revenue (MRR) Growth** - Month-over-month revenue growth
   - Typical ranges: 10%+ MoM for early-stage, 3% MoM for established
   - Tier thresholds: TIER_1 (10%), TIER_2 (5%), TIER_3 (3%)
   - Lagging indicator

5. **Net Revenue Retention (NRR)** - Revenue retained from existing customers
   - Typical ranges: 110-120% is strong, 125%+ is world-class
   - Tier thresholds: TIER_1 (125%), TIER_2 (115%), TIER_3 (110%)
   - Lagging indicator

6. **Average Revenue Per User (ARPU)** - Average revenue generated per user
   - Typical ranges: Varies by segment; growth indicates pricing success
   - Tier thresholds: TIER_1 (min $100), TIER_2 (min $50), TIER_3 (min $25)
   - Lagging indicator

**RETENTION Metrics:**
7. **Customer Churn Rate** - Percentage of customers who cancel subscriptions
   - Typical ranges: 4-7% annually is healthy
   - Tier thresholds: TIER_1 (max 4%), TIER_2 (max 6%), TIER_3 (max 7%)
   - Lagging indicator

8. **Feature Stickiness** - Percentage of users who use feature multiple times
   - Typical ranges: 30-50% return within 7 days indicates stickiness
   - Tier thresholds: TIER_1 (50%), TIER_2 (40%), TIER_3 (30%)
   - Leading indicator

**ENABLEMENT Metrics:**
9. **Onboarding Completion Rate** - Percentage completing setup/onboarding
   - Typical ranges: 60-80% completion indicates good UX
   - Tier thresholds: TIER_1 (80%), TIER_2 (70%), TIER_3 (60%)
   - Leading indicator

10. **Support Ticket Volume** - Number of support requests per user per month
    - Typical ranges: <0.1 tickets/user/month is excellent
    - Tier thresholds: TIER_1 (max 0.05), TIER_2 (max 0.1), TIER_3 (max 0.2)
    - Leading indicator

Standard ranges above are used to inform default metric thresholds and per-epic targets but there is no longer a separate “adoption benchmark” entity or adoption-curve comparison feature.

#### 5.7 HEART Metrics Framework

The HEART framework (Google: Happiness, Engagement, Adoption, Retention, Task Success) provides an alternative, Pendo-centric model for post-launch success measurement alongside the standard success metrics.

- **HEART Categories**: Happiness, Engagement, Adoption, Retention, Task Success; admin-configurable with descriptions, icons, sort order, and whether a survey is required
- **Epic HEART Config**: Per-epic config with setup method (`auto`, `ai_assisted`, `manual`), status (`draft`, `active`, `archived`), optional AI model version, approval tracking
- **HEART Metrics**: Per-epic metrics with measurement types (e.g. `events_per_user`, `unique_users_percentage`, `return_rate_7_days`, `completion_rate`, `survey_score`, `nps_score`, `happiness_composite_score`); Pendo event IDs, segment, app; target value and timeframe; optional AI-suggested flag and rationale; custom metrics with category label and icon; optional link to custom metric template
- **Happiness Composite**: Happiness now supports `survey + frustration` scoring. Composite formula: `happiness = surveyWeight * effectiveSurvey + frustrationWeight * (100 - frustrationPenalty)` where `effectiveSurvey` uses real survey responses when present, otherwise an optimistic baseline. Default weights: survey `0.7`, frustration `0.3`; fallback survey baseline: `80`.
- **Milestones**: Multi-target metrics support milestones (days after launch, target value, label) for phased goals
- **AI-Assisted Setup**: `setupHeartMetricsWithAI` / `runHeartAgent` use epic context and Pendo context (events, features, segments, apps) to recommend metrics per HEART category; PMs can apply recommendations via Apply Recommendations flow
- **Default Target Policy**: Auto-applied HEART metrics now start from category defaults (admin-configured target + timeframe, with system fallbacks if defaults are missing) instead of using AI-suggested numeric targets, so PMs start from a consistent baseline and then adjust per epic.
- **Snapshots**: Daily and initial snapshots compute current value vs target; status ON_TRACK, AT_RISK, MISSED, PENDING. Cron job `/api/cron/heart-snapshots` runs daily (e.g. 01:00 UTC) and writes **yesterday's** snapshot per metric so we accumulate one immutable row per metric per closed day for historical charts and release impact. Dashboard still upserts "today" on load for live card/chart.
- **Chart history**: When stored snapshots exist for a metric (e.g. from release or last 180 days through yesterday), charts use DB history and only append live Pendo for "today"; otherwise history is built from Pendo until snapshots exist.
- **Release-centric view**: "Release impact" section on the HEART dashboard shows baseline (pre-release 30d average from stored snapshots) and Month 1–6 post-release monthly averages, from `epic_heart_snapshots` only (no Pendo). API: `GET /api/epics/[id]/heart/release-view`.
- **As-of date view**: Optional "View as of" date picker on the HEART dashboard; when set, `GET /api/epics/[id]/heart?asOf=YYYY-MM-DD` returns data from stored snapshots only (no live Pendo), so users can view a point-in-time report (e.g. for a retro).
- **Pendo Data Confidence**: Per-metric confidence level (high/medium/low/unknown), score, and issues (e.g. no recent data, low volume, missing feature/event, segment empty, data gap)
- **Pendo Query Resilience**: Track-event aggregation uses resilient filter logic across `track` and `trackType` entity representations and both name/id fields (`trackType`, `trackTypeId`, `id`, `name`) to reduce false zeroes when subscriptions expose different schemas.
- **HEART Dashboard**: Epic-level dashboard shows config, metrics with latest snapshot, trend, milestone progress, measurement period; list view of epics with HEART and overall status. Optional **View Pendo dashboard** link (configured in Admin → Success Measurement → Pendo) opens the team’s Pendo dashboard in a new tab for funnel drill-down without embedding reports in ClearGO.
- **Task Success (single event)**: When only one Pendo track/feature is configured, Task Success shows **% of users** (unique visitors who triggered the event ÷ total app visitors in the period), not raw completion counts.
- **Admin Defaults & Templates**: Category defaults (target value, timeframe, measurement type, guidance, example events, default milestones); custom metric templates (reusable across epics) with name, category label, measurement type, Pendo event pattern, defaults
- **API Surface**: `GET/POST /api/epics/[id]/heart`, `GET /api/epics/[id]/heart/setup-status` (poll for background job), `GET/POST /api/epics/[id]/heart/metrics`, `GET/POST /api/epics/[id]/heart/recommendations`, `POST /api/epics/[id]/heart/apply-recommendations`, `GET /api/epics/[id]/heart/snapshots`, `GET /api/epics/[id]/heart/release-view`, `GET/POST /api/epics/[id]/heart/automations`, `GET/POST /api/settings/success-measurement/heart/defaults`, `GET/POST /api/settings/success-measurement/heart/templates`; Pendo check and metrics by ID
- **HEART AI setup (Netlify)**: For `auto` and `ai_assisted` setup, the API enqueues a job and invokes a Netlify **background function** (15 min limit) to run `setupHeartMetricsWithAI`; the client receives `202` and polls `GET .../heart/setup-status?job_id=` until completed/failed. Requires env: `NETLIFY_HEART_SETUP_SECRET`, `NETLIFY_URL` (or `URL`) so the API can trigger `/.netlify/functions/heart-setup-background`.

#### 5.8 Happiness Automations & CSM Nudges

Automations drive proactive outreach when HEART or usage signals indicate risk (e.g. segment non-usage, usage drop, negative feedback, time since launch).

- **Trigger Types**: Segment non-usage (segment + feature/events + lookback), usage drop (threshold % and comparison period), negative feedback (survey + score threshold), feature struggle, time since launch (days + adoption % threshold)
- **Action Types**: Pendo guide (show in-app guide), Pendo NPS/satisfaction survey, CSM notification (Slack/email with template, account details, suggested action), Slack alert (channel, template, optional @mentions), email campaign and custom webhook (coming soon)
- **Rule Lifecycle**: Draft → pending approval → active/paused/completed/archived; recurring rules with interval and cooldown; max executions per user
- **Execution**: Evaluate trigger → get target audience → execute action; status pending/in_progress/completed/failed/cancelled; metrics (total reached, conversions, conversion rate)
- **CSM Nudges**: When action is CSM notification, system creates **CSM nudge** records (account, assigned CSM, status: pending/assigned/contacted/resolved/dismissed, context, notes); `GET/PATCH /api/csm/nudges`, `PATCH /api/csm/nudges/[nudgeId]` for list and update
- **APIs**: `GET/POST /api/epics/[id]/heart/automations`, `GET/PATCH/DELETE /api/epics/[id]/heart/automations/[ruleId]`, `POST /api/epics/[id]/heart/automations/[ruleId]/execute`

#### 4.2 Feedback Collection
- **Ideas portal (primary)**: `/feedback` embeds the Aha! Ideas portal via the official embedded script (`idea_portals/embedded/application.js`, `data-portal-url`). Portal must use **Embedded** display in Aha!; optional `NEXT_PUBLIC_AHA_IDEAS_PORTAL_URL` (default `https://cleargo.ideas.aha.io/`).
- **Legacy epic feedback data**: Historical rows in the `feedback` table and epic-level APIs remain for portfolio metrics and activity feed; new product ideas are collected in Aha! Ideas, not the in-app form.

### 5. Activity Feed

#### 5.1 Real-Time Activity Stream
- **Activity Types**:
  - Criterion status changes
  - Epic additions/updates
  - Release updates
  - Feedback additions
  - Decision snapshots
- **Activity Display**: 
  - Actor information (name, avatar)
  - Activity description
  - Timestamp (relative: "2h ago", "3d ago")
  - Link to related epic/criterion
- **Filtering**: Filter by activity type, epic, user
- **Pagination**: Load more activities on scroll

#### 5.2 Activity Feed Settings
- **Enable/Disable**: Admin setting to enable/disable activity feed
- **Display Location**: Sidebar on home dashboard
- **Sticky Positioning**: Activity feed stays visible while scrolling

### 6. My Items / Personal Dashboard

#### 6.1 My Items View
- **Criterion Ownership**: All criteria where user is decision owner or condition owner
- **Due Date Tracking**: Criterion due dates are computed from the **release train date** (`release_schedule.launch_date` for the epic’s Aha release name when present), otherwise the epic’s `target_launch_date`, plus each criterion’s **rating timing** (launch stages). The My Items API returns a computed `due_date` for display; stored `condition_due_date` is recalculated on epic sync / release cascade using the same rules. When an epic **moves to another release** (or its anchor launch date / UI-framework timing changes), Aha upsert and manual epic PATCH on `target_launch_date` or `aha_fields` trigger a full **recalculation of every criterion due date** for that epic.
- **Overdue Indicators**: Highlight overdue items
- **Status Summary**: Count of items by status
- **Quick Actions**: Direct links to update status
- **Read-only status**: In read-only contexts, the GO / CONDITIONAL / NO_GO traffic lights stay visible but are not clickable (same component as editable mode, with interaction disabled).
- **Greeting when viewing as**: If an admin uses view-as, the page greeting prefers the viewed user’s first name from their display name when available.
- **Page options menu**: The options menu stays open when clicking inside it (does not close on outside click) so nested actions remain usable.

#### 6.2 Personal Metrics
- **Pending Items**: Count of items requiring attention
- **Overdue Count**: Count of overdue criteria
- **Recent Updates**: Recently updated items

### 6A. Analytics Dashboard

- **Route**: `/analytics` (dashboard analytics page). Uses a thin server `page.tsx` that wraps the client dashboard in `<Suspense>` (see `AnalyticsDashboardClient.tsx`) for `useSearchParams` compatibility.
- **Access**: Gated by capability `analytics.read` (assigned via Admin > Settings > Permissions); SUPERADMIN, CPO, PRODUCT_OPS and other roles can be granted this capability
- **Performance**: Tabbed interface with lazy loading - only loads data for the active tab to improve initial page load performance
- **Sections** (top-level toggle):
  - **Releases**: Existing adoption/compliance/timeliness/outcomes analytics (filters apply here only).
  - **Roadmap**: Plan vs Actual reporting + optional Roadmap Rewind embed when `FEATURE_ROADMAP_REWIND` is enabled.
- **Tabs** (within **Releases**):
  - **Launch Metrics**: Success plan completion, Retro completion, Launch hygiene
  - **Timeliness**: Criteria timeliness, PM timeliness
  - **Usage Analytics**: Adoption metrics, stickiness metrics, usage by role, activity trends
- **Metrics**:
  - **Success plan completion**: Rate of epics with locked success config (snapshot and 6-month trends); filters: tier, pod, date range
  - **Retro completion**: Rate of T+30/60/90 retros submitted on time (snapshot and trends)
  - **Launch hygiene**: Distribution of launch readiness (e.g. GO vs CONDITIONAL vs NO_GO) over time (snapshot and trends)
  - **Criteria timeliness**: Share of criteria updated within staleness window; on-time stats
  - **PM timeliness**: Per-PM stats on criterion update timeliness
  - **Usage Analytics**:
    - **Adoption**: Total users, active users (7d/30d), new users this month
    - **Stickiness**: DAU/MAU ratio, WAU/MAU ratio, daily/weekly/monthly active users
    - **Usage by Role**: Activity breakdown by role (PM, PMM, ADMIN, etc.)
    - **Activity Trends**: Time series of daily active users and logins
- **Roadmap section — Plan vs Actual**:
  - Compares snapshot rows via RPC `get_period_plan_vs_actual` for epics where **`cleargo_candidate` is “Yes” or “Yes - UI Framework”** (join `epic.aha_id` = `roadmap_snapshot.aha_key`). **Modes**: `quarter_baseline` (Quarter Plan — first Q snapshot only; end = start), `quarter_progress` (first Q snapshot vs last snapshot in the selected in-quarter month; keys cumulative from Q start through that month), `quarterly` (Quarter Results — full quarter). **End** columns use each epic’s **latest** row in the comparison end window (not only the global last pull). **`in_end`** means the epic appears on the global **`end_dt`** snapshot. RPC also returns **`first_scan_aha_release`** (release on the epic’s **earliest** snapshot row in that same end window). **Status chips** (`derivePlanVsActualStatus`): **On Plan** (same train, not shipped); **Ahead of Plan** (not shipped, end train **earlier** than period-start train); **Delayed** (slipped later: within 2 trains **or** &lt;90d on `release_schedule` when measurable); **Postponed** (else slip vs period start or unmeasurable); **Delivered: On Time**; **Delivered: Early** (shipped on a train **earlier** than period-start — including `in_start && !in_end` when the last in-window row shows shipped + earlier `aha_release`); **Delivered: Delayed** (shipped later); **Delivered: Added**; **New Addition** (including net-new train-launch gate); **Removed** (absent from end snapshot without delivered + earlier-train path, or other removed rules). **Net-new delivered** same-train / Added rules unchanged. **Delivered** uses Aha workflow heuristics plus **`end_aha_progress` ≥ 100** when status lags. ClearGO **`epic`** is **not** used for chips.
  - **Release scope**: After RPC, rows are filtered so the epic’s applicable **Aha release train** (`YYYY.M` / `YYYY.MM`) falls in the report window — **`quarterly`** allows trains for any month in that calendar quarter; **`quarter_baseline`** / **`quarter_progress`** use the **same quarter-wide train set** as the old monthly drill-down (all trains in the quarter that contains the anchor month). Uses **end snapshot release** when the epic is still on the roadmap at period end, and **start snapshot release** when it was removed mid-period. Rows with missing or non-parseable release trains are kept.
  - **UI**: Quarter selector plus **Quarter Plan / one month in / two months in / Quarter Results**; table shows **GTM module** (from `gtm_module` only), latest **`epic_comment.movement_cause`** as Internal/External (with filter), optional **group by goal or GTM module** with sortable sub-tables, and ARR / status as before. **Reporting floor**: The quarter list and `planVsActualPeriodUi` / service layer clamp **`period_date` to Q1 2026 (`2026-01-01`) or later** so pre–Q1 2026 windows are not offered and API calls with older anchors are normalized to that floor (incomplete historical snapshot coverage).
  - **AI narrative** (optional): Claude structured output summarizes shifts using snapshot-derived rows plus `epic_comment` movement notes linked via `epic.aha_id`; prompts require **no speculation**. Results are **cached** in `roadmap_period_analysis` (unique per `period_type`, `period_start`; `period_type` includes `quarter_baseline`, `quarter_progress`, `quarterly`, and legacy `monthly` for old rows). Generation is gated by `roadmap.analysis.generate`. APIs: `GET /api/analytics/plan-vs-actual`, `POST /api/analytics/plan-vs-actual/analysis`.
  - **Line-level narrative**: Summary and reasoning per `aha_key` open in a **right-hand drawer** (same slideout pattern as Roadmap Snapshot). The model is prompted with status, releases, snapshot progress, GTM module, and PM reason when present. Goal / GTM / feature cells use `sanitizePivotCellString` from Aha pivot fields.
  - **Manual ARR / accounts**: Each row has a free-text **ARR / accounts** field. When period analysis is cached and the user can patch analysis, values persist in `roadmap_period_analysis.ai_analysis.itemInsights[].arrImpact`; otherwise they persist in **localStorage** for that period key until analysis exists. Full-period AI regeneration keeps non-empty manual ARR text per feature.
  - **Automatic generation**: When a user with `roadmap.analysis.generate` opens a period that has snapshot rows but **no** cached analysis, the client triggers generation once (same as the Generate button). **Cron**: GitHub Actions `roadmap-period-analysis.yml` (1st of month, UTC) calls `GET /api/jobs/roadmap-period-analysis` with `CRON_SECRET` to warm **`quarter_progress`** for the **prior calendar month** and, on Jan/Apr/Jul/Oct, **`quarterly`** for the **prior completed quarter** (skips if already cached). **Note**: Existing cache rows built under legacy `monthly` semantics stay stale until **force regenerate** after deploy.
- **Tabs** (within **Roadmap**): **Plan vs Actual** (always); **Roadmap Rewind** when the roadmap feature flag is on — same `RoadmapRewindView` as before.
- **Views**: Snapshot (current period) vs trends (time-series over configurable months); filters apply to all cards
- **APIs**: 
  - Launch Metrics: `GET /api/analytics/success-plan-completion`, `GET /api/analytics/retro-completion`, `GET /api/analytics/launch-hygiene` (optional query params: tier, pod, date_range_start, date_range_end, trends, months_back)
  - Timeliness: `GET /api/analytics/criteria-timeliness`, `GET /api/analytics/pm-timeliness` (optional query params: tier, pod, date_range_start, date_range_end)
  - Usage: `GET /api/analytics/usage?metric={adoption|stickiness|by-role|trends}` (optional query params: date_range_start, date_range_end, role, days_back)
  - Plan vs Actual: `GET /api/analytics/plan-vs-actual?period_type={quarter_baseline|quarter_progress|quarterly}&period_date=yyyy-MM-dd` (`period_date` = quarter start for baseline/results; first day of in-quarter month for `quarter_progress`), `POST /api/analytics/plan-vs-actual/analysis` (JSON body: `period_type`, `period_date`, optional `force`), `PATCH /api/analytics/plan-vs-actual/analysis` (partial updates including optional `item_insight`: `aha_key`, `summary`, `likely_reasons`, optional `arr_impact`), `POST /api/analytics/plan-vs-actual/analysis/item` (JSON body: `period_type`, `period_date`, `aha_key`) to regenerate AI narrative for one row (requires existing cached period analysis)
- **User Activity Tracking**: 
  - Tracks user logins and activity in `user_activity` table
  - Login activity tracked automatically via `/api/me` endpoint (throttled to once per hour per user)
  - Activity also tracked when users perform actions (e.g., updating criteria status, delegating tasks) via `trackActivityFromAction()` to ensure API-only users are counted in usage analytics
  - Action-based tracking is throttled (only tracks if last login was more than 1 hour ago or null)
  - Updates `app_user.last_logged_in` timestamp on login

### 7. Decision Snapshots

#### 7.1 Snapshot Creation
- **Snapshot Types**: 
  - GO_NO_GO_MEETING
  - READINESS_REVIEW
  - POST_LAUNCH_REVIEW
- **Snapshot Data**: Serialized state of epic at time of snapshot:
  - All criterion statuses
  - Readiness score
  - Verdict
  - Risk level
  - Gate counts
- **Snapshot Notes**: Free-form notes explaining decision
- **Verdict Selection**: GO, CONDITIONAL_GO, NO_GO
- **Created By**: Track who created snapshot

#### 7.2 Snapshot History
- **Snapshot List**: Chronological list of all snapshots
- **Snapshot View**: Read-only view of snapshot state
- **Comparison**: Compare snapshots over time
- **Export**: Export snapshot data

### 8. Meetings Integration

#### 8.1 Meeting Management
- **Meeting Creation**: Create meetings manually or sync from Google Calendar
- **Meeting Linking**: Link meetings to epics
- **Meeting Metadata**: Title, description, date, duration
- **Multiple Epic Linking**: Link one meeting to multiple epics

#### 8.2 Transcript Management
- **Transcript Upload**: Upload meeting transcripts
- **Transcript Storage**: Store full transcript text
- **Transcript Display**: View transcripts in meeting detail

#### 8.3 Snippet Extraction
- **AI-Powered Extraction**: Extract relevant snippets from transcripts
- **Criterion Linking**: Link snippets to specific criteria
- **Relevance Scoring**: Score snippet relevance to criteria
- **Snippet Display**: View snippets in context of criteria

#### 8.4 Google Calendar Integration
- **OAuth Connection**: Connect Google Calendar account
- **Automatic Sync**: Sync calendar events to meetings
- **Event Linking**: Link calendar events to meetings
- **Calendar ID Support**: Support for multiple calendars

### 9. Admin Features

#### 9.1 Criteria Administration
- **Criteria CRUD**: Create, read, update, delete criteria
- **Criteria Import**: Import from Excel template
- **Bulk Operations**: Activate/deactivate multiple criteria
- **Category Management**: Manage criterion categories
- **Role Mapping**: Map decision owner roles to criteria
- **Deletion behavior**: Deleting a criterion is restricted to admin roles (PRODUCT_OPS/CPO/SUPERADMIN) and enforced via database row-level security so deletes persist across refresh.

#### 9.2 Settings Management
- **Per-Tier Thresholds**: Configure readiness thresholds per tier
- **Staleness Window**: Configure days before criterion considered stale (default: 14)
- **Digest Schedule**: Configure weekly digest schedule (default: Monday 9:00 AM)
- **Email Allowlist**: Configure allowed email domains (default: clearcompany.com)
- **Fallback User**: Configure fallback Product Ops user
- **Timezone**: Configure company timezone
- **Pod Order**: Configure user-defined order of pods for consistent display throughout the app
- **Aha! Configuration**:
  - Webhook secret
  - Fields to load
  - Tags filter
  - Webhook URL
- **Jira Configuration**:
  - Jira domain (e.g., clearco.atlassian.net)
  - Jira email (email associated with API token)
  - Jira API token (for Basic Auth)
  - Jira Cloud ID (fetched automatically)
- **Slack Configuration**:
  - Bot token
  - Signing secret
  - App ID
  - Default channel
  - Notification settings
  - **Slack allowed recipients**: Optional allowlist of email addresses permitted to receive Slack messages (`slack_allowed_recipients` in app_settings). If empty, all users with Slack handles can receive messages; if set, only listed emails receive Slack notifications.
- **Email Templates**: Configure email templates for notifications
- **Activity Feed**: Enable/disable activity feed

#### 9.3 User Management
- **User List**: View all users
- **User Roles**: Assign roles to users
- **Bulk Operations**: Bulk invite, bulk delete users
- **User Invitations**: Send invitation emails
- **Avatar Management**: Upload and manage user avatars
- **Slack Handle Sync**: Sync Slack handles for users

#### 9.4 Audit Log
- **Audit Viewer**: View all system changes
- **Filtering**: Filter by actor, entity type, date range
- **CSV Export**: Export audit log to CSV
- **Change Tracking**: Track all changes to epics, criteria, settings
- **JSON Diff**: View before/after state of changes

#### 9.5 Success Measurement Administration
- **Metric Catalog**: Create, edit, and manage success metrics with thresholds and data sources
- **Scorecard Management**: Admin scorecards page under Success Measurement exposes the active window (-90 .. +120 days from launch) and provides a one-click backfill action to generate missing scorecards for all currently active epics up to today.
- **Pendo Integration**: Configure Pendo API integration for automatic metric data; optional **Pendo dashboard URL** (`app_settings.pendo_dashboard_url`) for the HEART metrics external link
- **Snowflake Integration**: Configure Snowflake integration for data warehouse metrics
- **Settings Pages**: Admin UI for managing metrics, scorecards, and integrations

#### 9.6 Pod Management
- **Pod List**: View all pods
- **Pod Configuration**: Configure pod settings
- **Product-Pod Mapping**: Map products to pods

#### 9.7 Admin Impersonation
- **Who Can Impersonate**: Only users with role **SUPERADMIN** can start or stop impersonation
- **Start Impersonation**: `POST /api/admin/impersonate` with target user email; server issues a signed JWT cookie (`cleargo_impersonate`) with short expiry; effective user for all subsequent requests is the impersonated user
- **Stop Impersonation**: `POST /api/admin/impersonate/stop` clears the impersonation cookie; user returns to their real identity
- **Restrictions**: Cannot impersonate another super admin; enforced server-side
- **UI**: **Impersonation Banner** shown when impersonating (duration, "Stop impersonating" button); hidden on login and setup-password pages
- **Implementation**: `src/lib/auth/impersonation.ts`, `src/components/ImpersonationBanner.tsx`, `src/app/api/admin/impersonate/`; `getEffectiveUserEmail()` used where effective user is needed

#### 9.8 Feature Flags
- **Per-User Flags**: Feature flags are fetched per authenticated user via `GET /api/settings/feature-flags`
- **Storage**: Flags stored in settings/DB; `getFeatureFlags()` returns the current set of flags
- **Use**: Enables gradual rollouts and feature toggles without code deploy

### 10. Notifications & Reminders

#### 10.1 Email Notifications
- **Stale Criterion Reminders**: Daily reminders for criteria not updated in staleness window (see scheduled job below; reminders may include an AI-generated personalized nudge when configured).
- **Weekly Digest**: Summary of top launches by tier/risk
- **Risk Alerts**: Alerts when launch enters high-risk status
- **Go/No-Go Notifications**: Notifications when decision snapshots created
- **Status Change Notifications**: Notifications when readiness status changes

#### 10.2 Slack Notifications
- **Slash Commands**:
  - `/launch-status [name or aha-id]`: Get launch status
  - `/my-launches`: View user's launches
  - `/launch-summary [tier] [risk]`: Get launch summary
  - `/update-criterion [launch-id] [criterion-id] [status]`: Update criterion
- **Interactive Messages**: Buttons and dropdowns for quick actions; links use `/epics/{id}` for epic detail.
- **Stale Criterion Reminders**: Daily job (`/api/jobs/stale-criteria`) sends Slack (and email) reminders; when `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` is set, each reminder can include an **AI-generated personalized nudge** (context-aware, concise) to improve engagement.
- **Criteria Due Date Nudges**: Daily job (`/api/jobs/criteria-nudges`) sends Slack and email reminders for criteria based on due dates stored on `epic_criterion_status.condition_due_date` (recalculated from the release schedule anchor and rating timing as above):
  - **1 week before due date**: Reminder sent 7 days before `condition_due_date`
  - **On due date**: Reminder sent on the exact `condition_due_date`
  - **Daily after overdue**: Daily reminders for criteria past their due date
  - **Grouping**: All criteria for a user are grouped into a single message, organized by release (closest future release first), then by epic within each release, sorted by urgency
  - **Email Support**: Email notifications are sent alongside Slack notifications (if enabled in settings)
  - **Past Release Filtering**: Criteria reminders are excluded for epics with past release dates or released status (`Released_Cohort_1`, `Released_GA`, `Released_Retroed`), except for missing metrics reminders (see below)
  - **Missing Metrics Reminders**: For past releases, Product Managers receive reminders about missing success metrics if:
    - Epic has no `epic_success_metrics` entries
    - `track_offline = false` in `epic_success_configs`
    - Reminder uses the "Success Defined" criterion due date if available, otherwise uses today's date
- **App Home**: Personalized dashboard in Slack
- **URL Unfurling**: Rich previews for launch console links
- **Channel Notifications**: Post to configured Slack channels
- **DM Notifications**: Send direct messages to users

#### 10.3 Notification Logging
- **Notification History**: Track all sent notifications
- **Delivery Status**: Track delivery success/failure
- **Retry Logic**: Automatic retries for failed notifications
- **Channel Tracking**: Track delivery channel (email, Slack)

### 11. Launch Stages

#### 11.1 Stage Management
- **Stage Definition**: Define launch stages (e.g., Product Definition Complete, Pre-Launch, Launching, Launched, Post-Launch)
- **Stage Transitions**: Track epic stage transitions
- **Stage-Based Criteria**: Link criteria to specific stages
- **Rating Timing**: Link criteria rating timing to stages

#### 11.2 Two-Scope Stage Model
Launch stages are scoped so that **Release Schedule** (legacy) and **UI Rollout** (UI Framework epics) each have their own independently managed stage set. Each stage has a `stage_type`: **phase** (duration bar on the timeline) or **milestone** (diamond marker at a point in time).

- **Release Schedule** (`scope = 'release_schedule'`): Used for epics that follow the legacy release calendar. Milestones: Product Definition Complete (left edge), Cohort 1 Live (release point), GA / Cohort 2 (end). Phases: GTM Access and Prep, Internal Readiness. One Go/No-Go checkpoint (in GTM Access and Prep).
- **UI Rollout** (`scope = 'ui_rollout'`): Used for epics with ClearGO Candidate = "Yes - UI Framework". Phases: UX Preview, GTM Access and Prep, Internal Readiness. Milestones: Cohort 1 (release point), Cohort 2 / GA (end). Durations can vary by UI/UX Impact Level (1–3); multiple Go/No-Go gates (e.g. after UX Preview and after GTM Access and Prep) are supported via the `is_gate` flag.

The epic detail timeline renders phases as colored duration bars and milestones as diamond markers; a lighter "Cohort 1 Feedback" bar spans the period between Cohort 1 release and GA. Criterion due dates use the appropriate stage set and, for UI Rollout, level-aware durations when the epic has a UI/UX Impact level. Matrix **stage boundary** dates (criteria with `rating_timing` tied to a stage) use the **same** walk as the timeline: **Release Schedule** epics use **calendar** days with pre-launch = sum of stage durations **before** Cohort 1 only; **UI Rollout** epics use **business** days and level-aware durations from the anchor date.

**Unified due-date definition (segment end):** Everywhere the product derives a criterion due date from launch stages (epic recalculation / `condition_due_date`, My Items on Home when unset, analytics on-time and PM-timeliness fallbacks), the date is the **last calendar day of that stage’s segment** on the timeline—the same rule as the Release Timeline chart—implemented in shared logic (`releaseTimeline.ts`), not legacy “offset from launch by summed durations from day one of the stage.” Matrix tooltips describe this as the last day of the named stage’s segment on the launch timeline.

#### 11.3 Launch Stage Phases (Release Schedule)
- **Product Definition Complete** (31 days, milestone): Product definition ready for GTM planning; shown as a diamond at the left edge of the timeline.
- **GTM Access and Prep** (14 days, phase): Features available and functioning properly. Go/No-Go decision typically happens during this phase.
- **Internal Readiness** (21 days, phase): Product Education documentation and training ready for internal teams.
- **Cohort 1 Live** (28 days, milestone): First batch of customers are live; shown as a diamond at the release point. The 28-day period is visualized as a lighter "Cohort 1 Feedback" bar on the timeline.
- **GA / Cohort 2 Live** (ongoing, milestone): All customers are live; shown as a diamond at the end of the timeline.

#### 11.4 Date Calculations
- **Target Release Date**: Represents the beginning of Cohort 1 Live phase
- **Go/No-Go Date Calculation**: Calculated by subtracting only the pre-launch phases (GTM Access + Internal Readiness = 35 days) from the target release date. The calculation excludes Cohort 1 Live duration since the target release date already represents the start of that phase.
- **Default Fallback**: If launch stages are not configured, defaults to 35 days before target release date

### 12. Comments & Collaboration

#### 12.1 Criterion Comments
- **Threaded Comments**: Comments per criterion
- **Comment Attribution**: Track comment author
- **Comment Timestamps**: Track when comments added
- **Comment Attachments**: Attach files to comments
- **Comment Notifications**: Notify relevant users of new comments
- **@Mentions**: Users can @mention someone in a comment (type @ and pick from a user list). Mentioned users are stored and shown inline in the comment text.
- **Slack for comments**: When a comment is added, the criterion’s decision owner is notified via Slack (if the commenter is not the owner). If the comment @mentions someone other than the owner, both the owner and the mentioned user receive the same notification in a single Slack thread (multi-party DM).

#### 12.2 File Attachments
- **Criterion Attachments**: Attach files to criteria
- **Comment Attachments**: Attach files to comments
- **File Storage**: Store files in Supabase storage
- **File Display**: View and download attached files
- **File Types**: Support common file types (PDF, images, documents)

### 13. Delegation

#### 13.1 Criterion Delegation
- **Delegate Ownership**: Delegate criterion decision ownership
- **Delegation Types**: 
  - Decision owner delegation
  - Condition owner delegation
  - Post-launch owner delegation (for success measurement)
- **Delegation History**: Track delegation changes
- **Delegation Notifications**: Notify delegates of assignments

### 11. Roadmap Snapshot & Rewind

Time-series visibility into how the roadmap moves week over week. Merged in from the standalone Roadmap Rewind Visualizer (RRV) app; the merge is gated behind the `roadmap_rewind` feature flag (`FEATURE_ROADMAP_REWIND`, see `src/lib/flags.ts`).

#### 11.1 Weekly Snapshot Job
- **Cron**: GitHub Actions `roadmap-snapshot.yml` runs Mondays 08:00 UTC, hitting `/api/jobs/roadmap-snapshot` with the standard `CRON_SECRET` bearer auth
- **Source**: Aha! custom-pivot REST endpoint (`AHA_ROADMAP_PIVOT_ID`), paginated and normalized in `src/lib/aha/pivotNormalizer.ts` and `src/lib/aha/pivotMapping.ts`. Pivot columns **GTM Module**, **GTM Name**, and **Epic promoted ideas vote count** are mapped into `gtm_module`, `gtm_name`, and `aha_promoted_ideas_votes` when present (titles must match exactly).
- **Sink**: `roadmap_snapshot` table — partitioned by `snapshot_date` (monthly partitions), with `epic_id` populated via `aha_key ↔ epic.aha_id` lookup; unmatched keys are tracked but not blocked
- **Maintenance**: monthly `/api/jobs/ensure-snapshot-partitions` cron keeps current+next-3-months partitions ahead of the calendar via `public.ensure_roadmap_snapshot_partitions()`
- **Replaces**: a standalone n8n workflow that previously fed RRV's `roadmap` table

#### 11.2 Roadmap Snapshot page (`/portfolio/snapshot`)
- Latest weekly pivot snapshot with field-level "Changes vs prior week" badges (release, dates, status, owner, pod / GTM module, GTM name, t-shirt size). **Display**: item titles and the Pod line prefer **GTM Name** / **GTM Module** when non-empty; otherwise **Epic name** / **Dev Backlog/Pod** (`getDisplayName` / `getDisplayPod` in `src/lib/roadmap/displayNames.ts`). **Promoted-ideas vote count** is stored only (not shown in UI yet).
- **Upcoming Release Impact panel** (`UpcomingReleaseImpact.tsx`) — pinned above the accordion, this is the Mantine port of RRV's "Release Movements Impacting Upcoming Releases" summary. Pulls weekly movement data from `usePeriodReleaseMovements` (week-of effective snapshot date) and `useYearlyMovements` and categorizes each movement into accelerated / delayed / new for each upcoming release. Items where `to_release` is `NULL` (epic moved out of the visible report window) are classified as **delayed** and tagged `Moved {N}+ releases out` with a tooltip explaining the report-window cutoff. Each row is clickable and pushes `EpicHistoryView` into the slideout stack
- Per-release accordion shows release date with a **`Cohort 1:` prefix** and a tooltip explaining the date is Cohort 1's GA and Cohort 2 typically lands ~4 weeks later (sometimes 5, since releases aim for mid-month)
- Per-epic **Confidence** column rendered as a colored badge (very_low → very_high). PM/PRODUCT_OPS/CPO/SUPERADMIN see a click-to-edit affordance opening the `ConfidenceAdjustmentDialog` (slider + preview + audit-noted save)
- **CSM Priority badge** surfaces inline in the simple grid Item cell and on the expanded `RoadmapItemCard` whenever `aha_csm_priority` is non-empty, with a tooltip carrying the actual priority value
- **Changes column** uses field-aware labels — single non-timeline change → `"<Field> changed"`, multiple → `"N fields changed"`, timeline → `"Timeline shifted"`, unchanged → `"No changes"`. Each badge has a tooltip listing the specific changed fields (`FIELD_DISPLAY_NAMES` map)
- **Snapshot date selector** — pin the table to any historical snapshot. Historical mode also computes a real diff against the snapshot immediately preceding the chosen date (`useHistoricalRoadmapComparison`), so the "Changes" column stays meaningful for past weeks
- **AI epic blurbs** — short (~15-word) summaries per epic, cached in `ai_description_cache` by `(snapshot_date, aha_key)` and loaded via `POST /api/roadmap/card-descriptions` (`useCardDescriptions`). Generation uses **Anthropic** Claude with the same model fallback order as RRV (Haiku 4.5 → legacy Haiku 3 → Sonnet 4.5 on 404); requires **`CLAUDE_API_KEY`** (ClearGO standard; `ANTHROPIC_API_KEY` also accepted). Shown on expanded roadmap cards and in the epic history slideout for the viewed snapshot week
- Click any row to push the **Epic History** view into a stack-based slideout drawer (see 11.4)
- Universal read access for any authenticated user

#### 11.3 Roadmap Rewind page (`/portfolio/rewind` → `/analytics`)
- **Navigation**: `/portfolio/rewind` redirects to `/analytics?section=roadmap&roadmapTab=rewind`. The sidebar portfolio link for Rewind was removed; use **Analytics → Roadmap → Roadmap Rewind**.
- Top summary tiles: epics tracked, stable-this-week count + %, moved-this-week, moved-YTD
- Three KPI cards (week / quarter-to-date / year-to-date) — clickable, push the period drilldown into the slideout stack
- Movements-per-week bar chart + weekly heatmap (impact-categorized via SQL)
- **Release delivery** tile: most-recent past release commitment %, on-time / 1-late / 2+late split, in-progress callout (powered by `get_release_delivery_metrics`)
- **Priority & goals delivered** tile: CSM-priority + goals-linked epics shipped per last release / QTD / YTD (powered by `get_priority_goals_delivery_metrics`)
- **Historical comparisons** when scrubbing past snapshots: summary tiles and drilldowns use `useHistoricalRoadmapComparison` so stable/epic counts align with the selected week (not only the latest live pivot)
- **AI epic blurbs** — same cached Claude summaries as the Snapshot page (`ai_description_cache` / `useCardDescriptions`), surfaced in period drilldowns, goal-breakdown drilldowns, and epic history for the selected snapshot date
- Snapshot date picker for "as-of" historical analytics
- Universal read access for any authenticated user

#### 11.4 Stack-based slideout drilldown (`SlideoutContext`)
Mantine `Drawer` driven by a stack of view entries. Each push adds a back-arrow to the header so users can drill arbitrarily deep without losing context.
- **`PeriodMovementsView`** (top-level from KPI/heatmap clicks): table of epics that moved release in the period, with from/to release, impact badge, and PM-override marker
- **`EpicHistoryView`** (pushed from snapshot rows or from a `PeriodMovementsView` / `UpcomingReleaseImpact` row): port of RRV's `ItemHistoryView` with a current-state card (status, release, dates, owner, pod), Aha + Jira deep links, `ConfidenceBadge`, optional CSM-priority pill, optional italic **AI summary** line when a cached blurb exists for that epic and snapshot week, "What changed in the latest snapshot" red-strikethrough → green diff, and a unified Mantine `Timeline` of release movements + PM movement notes. T-shirt size is intentionally excluded from the current-state card (it's eng-internal); it still appears in the change diff if it shifts between snapshots
- PM-only **Add note** affordance on each timeline movement row (and a top-level "Add note about this epic" button) — opens an inline `AddEpicNoteForm` that writes to `epic_comment` with a required **classification** (`movement_cause`): `Internal, Engineering` \| `Internal, Design` \| `Internal, Product` \| `Internal, GTM` \| `External, Third-party` (legacy imports may still show plain `Internal` \| `External`). Movement-row notes use `category='movement'` with `movement_date` / `from_release` / `to_release` / `related_snapshot_date`; the header **Add note** uses `category='general'` but the same classification control

#### 11.5 Epic-detail tabs
On `/epics/[id]`, when the feature flag is enabled and the epic has an `aha_id`:
- **Rewind tab**: weekly `roadmap_snapshot` rows for this epic (newest first), showing release / end date / status drift over time
- **Confidence tab**: per-snapshot delivery confidence rating with PM adjustment offset; read-only display by default. Adjustment controls are gated by `roadmap.confidence.adjust`

#### 11.6 Confidence rating
- Calculator lives in `src/lib/roadmap/confidenceCalculator.ts` (pure TypeScript, unit-tested). Bumping `CONFIDENCE_FORMULA_VERSION` invalidates the cache
- Stored per `(aha_key, snapshot_date)` in `confidence_rating`; PM offsets persist in the same row and are appended to `confidence_adjustment_history` with the previous + new percentage and an optional note
- Levels: `very_low` (≤25), `low` (≤45), `medium` (≤65), `high` (≤85), `very_high` (>85)
- **PM adjustment UX**: `ConfidenceAdjustmentDialog` (Mantine `Modal`) with slider (-20% → +20% in 5% steps), live preview, quick ±5/Reset buttons, optional note. Visible only to roles in `PRODUCT_WRITE_ROLES` (`SUPERADMIN`, `PRODUCT_OPS`, `CPO`, `PM`, `PRODUCT`); enforced both client-side and via `confidence_rating` RLS

#### 11.7 PM impact overrides
PMs can override the algorithm-calculated impact level on a release movement by `(aha_key, week_start)` via `pm_impact_override`, gated by `roadmap.impactOverride.write`. Stored alongside the calculated impact for full audit.

#### 11.8 Movement notes (PM Notes folded into comments)
RRV's `pm_notes` migrated into the new `epic_comment` table with `category='movement'`, preserving `movement_cause` (legacy Internal/External), `movement_date`, `from_release`, `to_release`, and `related_snapshot_date`. New notes require granular `movement_cause` values (Internal + Engineering/Design/Product/GTM, or External + Third-party). Threaded under the epic, not the criterion. Read access is universal; write access is gated to `PRODUCT_WRITE_ROLES` via the inline `AddEpicNoteForm` (see 11.4) and `epic_comment` RLS.

#### 11.9 Per-user hidden items
Each user can hide individual epics from their own roadmap views via `roadmap_hidden_item` (no special role required, gated by `roadmap.hiddenItem.write`).

#### 11.10 Visit tracking
Snapshot and Rewind both record visits in the `roadmap_visit` table — one row per `(app_user_id, snapshot_date, page)` so re-visits during the same snapshot week bump `visit_count` / `last_visited_at` rather than creating duplicates. Visits are only recorded when the user is viewing the **latest** snapshot (so scrubbing through history doesn't bloat counts on old snapshots).

The page header surfaces a `[👁 N visitor(s)]` button that opens a slideout (`VisitStatsView`) with a by-role breakdown plus a "Recently" list of the last 5 visitors. Read access is universal; the write goes through `POST /api/roadmap/visits` (using the service-role admin client so it works for both Supabase Auth and magic-link/`lr_session` users — `auth.jwt()` would otherwise be NULL for magic-link users and the RLS insert policy would silently reject them).

This is the ClearGo equivalent of RRV's `user_visits` feature, swapping IP-address + sessionStorage department for ClearGo's authenticated user identity and the `app_user.roles` array.

---

## Technical Architecture

### Frontend Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI Library**: Mantine UI v8
- **Styling**: Tailwind CSS v4
- **Page Styling Guidelines**: See `docs/PAGE_STYLING_GUIDELINES.md` for standard page container structure, typography hierarchy, spacing patterns, and font usage across all dashboard pages
- **Skeleton Loading Guidelines**: See `docs/SKELETON_LOADING_GUIDELINES.md` for best practices on implementing skeleton loading states, common mistakes to avoid, and how to ensure smooth loading experiences
- **Icons**: Tabler Icons React
- **State Management**: React Hooks
- **Forms**: Mantine Form with Zod validation
- **Notifications**: Mantine Notifications

### Backend Stack
- **Runtime**: Node.js
- **Framework**: Next.js API Routes
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth (Google OAuth)
- **Storage**: Supabase Storage
- **Email**: Resend
- **File Processing**: xlsx library
- **AI**: Google Gemini (via Vercel AI SDK) for checklist pruning suggestions and personalized stale-criterion nudges; requires `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`; implementation in `src/lib/ai/client.ts`.

### Database
- **Provider**: Supabase (PostgreSQL)
- **Migrations**: SQL migration files
- **RLS**: Row-Level Security policies
- **Indexes**: Performance-optimized indexes
- **Functions**: PostgreSQL functions for complex queries

### Integrations
- **Aha!**: REST API integration
- **Slack**: Slack API (Bolt framework)
- **Google Calendar**: Google Calendar API (OAuth 2.0)
- **Resend**: Email delivery

### Deployment
- **Hosting**: Vercel (Next.js)
- **Database**: Supabase Cloud
- **Storage**: Supabase Storage
- **Environment**: Production, Staging, Development

---

## Data Model

### Core Entities

#### Epic (Launch)
- `id` (UUID, Primary Key)
- `name` (Text)
- `aha_id` (Text, Unique)
- `aha_url` (Text)
- `product_id` (UUID, Foreign Key → product)
- `product_component` (Text)
- `pod` (Text)
- `tier` (Enum: TIER_1, TIER_2, TIER_3)
- `target_launch_date` (Date)
- `scheduled_ga_dev_date` (Date)
- `status` (Enum: Pre_Release, Released_Cohort_1, Released_GA, Released_Retroed, Cancelled)
- `readiness_score` (Float, 0-100)
- `readiness_status` (Enum: GO, CONDITIONAL_GO, NO_GO, NOT_EVALUATED)
- `risk_level` (Enum: LOW, MEDIUM, HIGH)
- `owner_id` (UUID, Foreign Key → app_user)
- `owner_email` (Text)
- `business_priority` (Text)
- `csm_priority` (Text)
- `tags` (Text Array)
- `console_url` (Text)
- `last_go_no_go_decision_date` (Date)
- `gtm_link` (Text)
- `activation_process` (Text)
- `new_org_setup` (Text)
- `existing_org_setup` (Text)
- `pricing_model` (Text)
- `modified_rice_score` (JSONB)
- `wsjf_score` (JSONB)
- `aha_fields` (JSONB) - Full Aha! field mapping (includes `standard_fields.integrations` for external links like Jira). Custom fields include `cleargo_candidate` and `uiux_impact` (UI/UX Impact Level 1-5); both are always synced for UI Framework rollouts.
- `archived` (Boolean, Default: false) - Whether the epic is archived. Epics are automatically archived when cleargo_candidate is not "Yes" and unarchived when it becomes "Yes" again.
- `jira_epic_key` (Text, Nullable) - Cached Jira epic key for linking to Jira tickets
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Criterion
- `id` (UUID, Primary Key)
- `label` (Text)
- `description` (Text)
- `category` (Text)
- `gate` (Boolean) - Whether this is a gate criterion
- `tier_applicability` (Text Array) - Which tiers this applies to
- `decision_owner_role` (Text) - Role that owns this criterion
- `decision_owner_email` (Text) - Email of decision owner
- `status_definition_go` (Text)
- `status_definition_conditional` (Text)
- `status_definition_no_go` (Text)
- `sort_order` (Integer)
- `is_active` (Boolean)
- `rating_timing` (Integer, Foreign Key → launch_stage)
- `data_sources` (JSONB, Nullable) - Optional list of data sources used to surface evidence (Aha fields, Aha description extraction, URLs, Jira JQL links)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Epic Criterion Status
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic)
- `criterion_id` (UUID, Foreign Key → criterion)
- `status` (Enum: GO, CONDITIONAL, NO_GO, NOT_SET)
- `current_status_notes` (Text)
- `condition` (Text) - For CONDITIONAL status
- `condition_type` (Enum: PRE_LAUNCH, T_PLUS_30, T_PLUS_90)
- `condition_due_date` (Date)
- `condition_owner_id` (UUID, Foreign Key → app_user)
- `decision_owner_id` (UUID, Foreign Key → app_user)
- `last_updated_at` (Timestamp)
- `last_updated_by` (UUID, Foreign Key → app_user)
- `score_value` (Integer) - Calculated score (2, 1, 0, null)
- `data_source_values` (JSONB, Nullable) - Per-epic values for data sources that require input (e.g., URL links)
- `ai_prune_suggested` (Boolean, Default: false) - True when AI suggests this criterion may be irrelevant for this epic
- `ai_prune_reason` (Text, Nullable) - Short reason for the suggestion; used in the AI Checklist Suggestions banner
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### App User
- `id` (UUID, Primary Key)
- `email` (Text, Unique)
- `name` (Text)
- `first_name` (Text)
- `last_name` (Text)
- `roles` (Text Array)
- `is_active` (Boolean)
- `slack_handle` (Text)
- `avatar_url` (Text)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Product
- `id` (UUID, Primary Key)
- `name` (Text)
- `pillar` (Text)
- `pod` (Text)
- `owner_id` (UUID, Foreign Key → app_user)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Release Schedule
- `id` (Integer, Primary Key, Serial)
- `release_name` (Text, Unique)
- `launch_date` (Text) - ISO date string
- `archived` (Boolean, Default: false)
- `aha_epic_count` (Integer, Nullable) - Cached total number of epics from Aha!
- `aha_epic_count_updated_at` (Timestamp, Nullable) - When count was last fetched
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Decision Snapshot
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic)
- `taken_at` (Timestamp)
- `decision_type` (Enum: GO_NO_GO_MEETING, READINESS_REVIEW, POST_LAUNCH_REVIEW)
- `verdict` (Enum: GO, CONDITIONAL_GO, NO_GO)
- `notes` (Text)
- `created_by` (UUID, Foreign Key → app_user)
- `snapshot_data` (JSONB) - Serialized epic state
- `created_at` (Timestamp)

#### Feedback
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, Nullable) - Allows product-wide feedback not tied to a specific epic
- `feedback_text` (Text)
- `feedback_type` (Enum: EPIC, PROCESS, TOOL)
- `source` (Enum: manual, slack, email, meeting, aha)
- `attributed_to_id` (UUID, Foreign Key → app_user)
- `attributed_to_name` (Text)
- `attributed_to_email` (Text)
- `created_by_id` (UUID, Foreign Key → app_user)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Meeting
- `id` (UUID, Primary Key)
- `title` (Text)
- `description` (Text)
- `meeting_date` (Timestamp)
- `duration_minutes` (Integer)
- `calendar_event_id` (Text, Unique)
- `epic_id` (UUID, Foreign Key → epic)
- `linked_epic_id` (UUID, Foreign Key → epic)
- `created_by` (UUID, Foreign Key → app_user)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Meeting Transcript
- `id` (UUID, Primary Key)
- `meeting_id` (UUID, Foreign Key → meeting)
- `transcript_text` (Text)
- `uploaded_at` (Timestamp)
- `created_at` (Timestamp)

#### Meeting Snippet
- `id` (UUID, Primary Key)
- `meeting_id` (UUID, Foreign Key → meeting)
- `snippet_text` (Text)
- `criterion_id` (UUID, Foreign Key → criterion)
- `epic_id` (UUID, Foreign Key → epic)
- `relevance_score` (Float)
- `created_at` (Timestamp)

#### Criterion Comment
- `id` (UUID, Primary Key)
- `launch_criterion_status_id` (UUID, Foreign Key → epic_criterion_status)
- `comment_text` (Text) - HTML; may include mention spans with `data-mention-user-id`
- `created_by` (UUID, Foreign Key → app_user)
- `mentioned_user_ids` (UUID Array, Nullable) - User IDs @mentioned in the comment; used for Slack multi-recipient notification
- `created_at` (Timestamp)
- `status_at_comment` (Text, Nullable)
- `previous_status` (Text, Nullable)
- `updated_at` (Timestamp)

#### Comment Read Status
- `id` (UUID, Primary Key)
- `comment_id` (UUID, Foreign Key → criterion_comment)
- `user_id` (UUID, Foreign Key → app_user)
- `read_at` (Timestamp) - When the comment was marked as read
- Unique constraint on (`comment_id`, `user_id`) - Each user can have one read status per comment

#### Criterion Attachment
- `id` (UUID, Primary Key)
- `epic_criterion_status_id` (UUID, Foreign Key → epic_criterion_status)
- `file_name` (Text)
- `file_url` (Text)
- `file_size` (Integer)
- `mime_type` (Text)
- `uploaded_by` (UUID, Foreign Key → app_user)
- `created_at` (Timestamp)

#### Comment Attachment
- `id` (UUID, Primary Key)
- `comment_id` (UUID, Foreign Key → criterion_comment)
- `file_name` (Text)
- `file_url` (Text)
- `file_size` (Integer)
- `mime_type` (Text)
- `uploaded_by` (UUID, Foreign Key → app_user)
- `created_at` (Timestamp)

#### App Settings
- `id` (UUID, Primary Key)
- `tier_1_threshold` (Float, Default: 0.90)
- `tier_2_threshold` (Float, Default: 0.80)
- `tier_3_threshold` (Float, Default: 0.70)
- `staleness_days` (Integer, Default: 14)
- `digest_schedule` (Text, Default: "MON_09_00")
- `allowlisted_domains` (Text Array, Default: ["clearcompany.com"])
- `fallback_user_email` (Text, Default: "agrunwald@clearcompany.com")
- `timezone` (Text, Default: "America/New_York")
- `pod_order` (JSONB, Default: []) - Ordered array of pod names for consistent display
- `aha_webhook_secret` (Text)
- `aha_webhook_url` (Text)
- `aha_fields_to_load` (Text Array)
- `aha_tags` (Text Array, Default: ["LaunchConsole", "cleargo", "ClearGO", "ClearGo"])
- `jira_domain` (Text, Nullable) - Jira domain (e.g., clearco.atlassian.net)
- `jira_email` (Text, Nullable) - Email associated with Jira API token (required for Basic Auth)
- `jira_api_token` (Text, Nullable) - Jira API token for authentication
- `jira_cloud_id` (Text, Nullable) - Jira Cloud ID (required for API calls, fetched automatically)
- `email_sender` (Text, Default: "noreply@tacticalsync.com")
- `slack_bot_token` (Text)
- `slack_signing_secret` (Text)
- `slack_app_id` (Text)
- `slack_default_channel` (Text)
- `slack_notification_settings` (JSONB)
- `email_templates` (JSONB)
- `enable_activity_feed` (Boolean, Default: true)
- `slack_allowed_recipients` (Text Array, Default: []) - If non-empty, only these email addresses may receive Slack notifications; if empty, all users with Slack handles may receive
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Audit Log
- `id` (UUID, Primary Key)
- `actor_id` (UUID, Foreign Key → app_user)
- `entity_type` (Text) - e.g., "epic", "criterion", "epic_criterion_status"
- `entity_id` (UUID)
- `taken_at` (Timestamp)
- `json_diff` (JSONB) - Before/after state
- `action` (Text) - e.g., "create", "update", "delete"
- `created_at` (Timestamp)

#### Notification Log
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → app_user)
- `type` (Text) - e.g., "stale_criterion", "risk_alert", "digest"
- `payload` (JSONB)
- `sent_at` (Timestamp)
- `delivery_channel` (Text) - "email" or "slack"
- `status` (Enum: sent, failed, pending)
- `error` (Text)
- `slack_ts` (Text) - Slack message timestamp
- `slack_channel` (Text)
- `created_at` (Timestamp)

#### Google Calendar Integration
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → app_user, Unique)
- `access_token` (Text)
- `refresh_token` (Text, Nullable)
- `token_expires_at` (Timestamp)
- `calendar_id` (Text, Default: "primary")
- `is_active` (Boolean, Default: true)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Launch Stage
- `id` (Integer, Primary Key, Serial)
- `name` (Text)
- `sort_order` (Integer; unique per scope)
- `duration_days` (Integer, Nullable)
- `details` (Text, Nullable)
- `scope` (Text, Default: 'release_schedule') — `release_schedule` or `ui_rollout`
- `level_durations` (JSONB, Nullable) — For UI Rollout: per-level min/max days, e.g. `{"1": {"min_days": 56, "max_days": 70}, "2": {...}, "3": {...}}`
- `is_gate` (Boolean, Default: false) — When true, stage boundary is a Go/No-Go checkpoint on the timeline
- `stage_type` (Text, Nullable) — `phase` (duration bar) or `milestone` (point-in-time diamond on the timeline)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Meeting Epic Junction
- `id` (UUID, Primary Key)
- `meeting_id` (UUID, Foreign Key → meeting)
- `epic_id` (UUID, Foreign Key → epic)
- `created_at` (Timestamp)

#### Adoption Benchmarks
- `id` (UUID, Primary Key)
- `name` (Text)
- `launch_tier` (Text, CHECK: TIER_1, TIER_2, TIER_3)
- `feature_type` (Text)
- `target_persona` (Text)
- `horizon_days` (Integer Array)
- `expected_activation` (Numeric Array)
- `expected_usage_depth` (Numeric Array, Nullable)
- `expected_ttfv_days` (Integer, Nullable)
- `segment_modifiers` (JSONB, Nullable)
- `is_default` (Boolean, Default: false)
- `version` (Integer, Default: 1)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Success Metrics
- `id` (UUID, Primary Key)
- `name` (Text)
- `category` (Text, CHECK: ADOPTION, REVENUE, RETENTION, ENABLEMENT, FRICTION)
- `description` (Text, Nullable)
- `measurement_type` (Text, CHECK: PERCENTAGE, COUNT, DURATION, BOOLEAN)
- `source` (Text, CHECK: PENDO, SNOWFLAKE, MANUAL)
- `pendo_event_id` (Text, Nullable)
- `leading_or_lagging` (Text, CHECK: LEADING, LAGGING)
- `thresholds` (JSONB, Nullable) - Tier-specific thresholds (TIER_1, TIER_2, TIER_3). Optional; some metrics rely solely on per-epic targets.
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Epic Success Configs
- `epic_id` (UUID, Primary Key, Foreign Key → epic, ON DELETE CASCADE)
- `benchmark_id` (UUID, Foreign Key → adoption_benchmarks)
- `post_launch_owner` (UUID, Foreign Key → app_user)
- `delegated_post_launch_owner_id` (UUID, Foreign Key → app_user, Nullable, ON DELETE SET NULL)
- `locked` (Boolean, Default: false)
- `locked_at` (Timestamp, Nullable)
- `success_metrics_published_at` (Timestamp, Nullable) - When set, success metrics are published and visible to all users; when null, draft (only users with Configure Success Metrics permission see them).
- `track_offline` (Boolean, Default: false)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Epic Success Metrics
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `metric_id` (UUID, Foreign Key → success_metrics, ON DELETE CASCADE)
- `target` (Numeric, Nullable) - Epic-specific target value for this metric. Required when metric is added to an epic.
- `pendo_event_id` (Text, Nullable) - Epic-specific Pendo event ID. Overrides metric default if provided.
- `snowflake_query` (Text, Nullable) - Epic-specific Snowflake query. Overrides metric default if provided.
- `manual_label` (Text, Nullable) - Label/description for manual metrics at epic level.
- `threshold_override` (JSONB, Nullable)
- `created_at` (Timestamp)
- `updated_at` (Timestamp) - Timestamp of last update to this epic metric configuration.
- UNIQUE(epic_id, metric_id)

#### Epic Success Metric History
- `id` (UUID, Primary Key)
- `epic_success_metric_id` (UUID, Foreign Key → epic_success_metrics, ON DELETE CASCADE, Nullable) - Links to the specific epic metric when present
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `metric_id` (UUID, Foreign Key → success_metrics, ON DELETE CASCADE)
- `change_type` (Text, CHECK: METRIC_ADDED, METRIC_REMOVED, TARGET_SET, TARGET_UPDATED, EVENT_CONFIG_UPDATED)
- `changed_by` (UUID, Foreign Key → app_user) - User who made the change
- `old_value` (JSONB, Nullable) - Previous configuration (target, event settings, threshold override)
- `new_value` (JSONB, Nullable) - New configuration (target, event settings, threshold override)
- `changed_at` (Timestamp, Default: now())

#### Epic Scorecards
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `snapshot_date` (Date)
- `metric_results` (JSONB)
- `benchmark_comparison` (JSONB)
- `overall_status` (Text, CHECK: ON_TRACK, AT_RISK, MISSED)
- `created_at` (Timestamp)
- UNIQUE(epic_id, snapshot_date)

#### Epic Retro Placeholders
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `day_marker` (Integer) - T+30, T+60, T+90
- `due_date` (Date)
- `submitted_at` (Timestamp, Nullable)
- `submitted_by` (UUID, Foreign Key → app_user, Nullable)
- `outcome` (Text, Nullable)
- `blockers` (Text, Nullable)
- `assumptions` (Text, Nullable)
- `action_items` (Text, Nullable)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Epic Success Reviews
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `reviewed_at` (Timestamp)
- `reviewed_by` (UUID, Foreign Key → app_user)
- `created_at` (Timestamp)

#### Pendo Integrations
- `id` (UUID, Primary Key)
- `api_key_encrypted` (Text)
- `environment` (Text, Default: 'prod')
- `last_sync` (Timestamp, Nullable)
- `status` (Text, Default: 'disconnected')
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Metric Values
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `metric_id` (UUID, Foreign Key → success_metrics, ON DELETE CASCADE)
- `value_date` (Date)
- `value` (Numeric)
- `source` (Text, CHECK: PENDO, SNOWFLAKE, MANUAL)
- `created_by` (UUID, Foreign Key → app_user, Nullable)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### HEART Framework (summary)
- **epic_heart_config**: Epic-level HEART config (setup_method, status, ai_model_version, approval)
- **epic_heart_metric**: Per-epic HEART metrics (category, measurement_type, pendo_event_ids, target_value, target_timeframe_days, ai_suggested, milestones, optional `composite_config` JSON for models like Happiness survey+frustration)
- **epic_heart_metric_milestone**: Multi-target milestones (days_after_launch, target_value, label)
- **epic_heart_snapshot**: Daily snapshot per metric (value, target_at_snapshot, status, data_confidence)
- **heart_category**: HEART categories (happiness, engagement, adoption, retention, task_success) with defaults
- **heart_custom_metric_template**: Reusable custom metric templates
- **heart_setup_jobs**: Background job queue for HEART AI setup (epic_id, app_user_id, setup_method, status: pending/running/completed/failed, result JSONB); client polls `GET .../heart/setup-status?job_id=`
- **happiness_automation_rule**: Trigger + action rules (segment non-usage, usage drop, CSM notification, Slack alert, etc.)
- **happiness_csm_nudge**: CSM nudge records (account, assigned CSM, status, context)
- **happiness_action_execution**, **happiness_automation_metrics**: Execution and metrics for automations
- **pendo_events_cache**: Cached Pendo events for AI agent context

#### Roadmap Snapshot & Rewind (RRV merge)
All gated behind `FEATURE_ROADMAP_REWIND`. RLS pattern is **universal SELECT for authenticated users, role-gated writes**.
- **roadmap_snapshot**: weekly Aha! pivot rows. Declared as `PARTITION BY RANGE (snapshot_date)` from day one with monthly child partitions (2023-01 → 2032-12 pre-created). Columns mirror RRV's `roadmap`: `epic_id` (FK → `epic.id`, `ON DELETE SET NULL`), `aha_key`, `snapshot_date`, plus Aha! pivot columns including `aha_name`, `aha_release`, `aha_release_date`, `aha_status`, `aha_t_shirt_est`, `aha_primary_goal`, `aha_calculated_devs`, `aha_owner`, `aha_initial_est`, `aha_pod`, `gtm_module`, `gtm_name`, `jira_key`, `aha_csm_priority`, `aha_progress`, `aha_promoted_ideas_votes` (votes ingested for future use). Insert-only (one row per epic per weekly snapshot). PK `(snapshot_date, id)`; unique `(snapshot_date, aha_key)`. Indexes on `(epic_id, snapshot_date DESC)`, `(aha_key, snapshot_date DESC)`, and `(snapshot_date)`.
- **ai_description_cache**: short Claude-generated summaries per epic per snapshot week (`snapshot_date`, `aha_key`, `description`, timestamps). Upserted by authenticated `POST /api/roadmap/card-descriptions` using the admin Supabase client; generation requires **`CLAUDE_API_KEY`** or **`ANTHROPIC_API_KEY`**. RLS: authenticated SELECT; inserts/updates only via service role through that route.
- **roadmap_delay_history** (view): aggregates `roadmap_snapshot` to surface per-epic delay event counts and totals (lifetime + YTD).
- **confidence_rating**: per `(aha_key, snapshot_date)` confidence rating from `confidenceCalculator`. Tracks `calculated_*` (algorithmic), `pm_adjustment` ([-20, 20]), `final_*` (clamped 0-100), `last_calculated_at`, `author_email`. Updates gated to PM/PRODUCT_OPS/CPO/SUPERADMIN via RLS.
- **confidence_adjustment_history**: append-only audit log of PM confidence adjustments (`previous_adjustment`, `new_adjustment`, `adjustment_delta`, `previous_final_percentage`, `new_final_percentage`, `adjustment_note`, `author_email`).
- **pm_impact_override**: PM impact-level overrides per `(aha_key, week_start)` (`original_impact`, `override_impact`, `override_note`). Optional FK to `epic.id`.
- **roadmap_hidden_item**: per-user hidden roadmap items, keyed by `(app_user_id, aha_key)`. RLS allows insert/delete only for the owning user.
- **epic_comment**: epic-level comments (separate from `criterion_comment`). Used for general epic discussion *and* movement notes (PM Notes from RRV) — `category` ∈ general | movement | risk | decision; PM roadmap notes store `movement_cause` as Internal/External **subtype** (`Internal, Engineering`, `Internal, Design`, `Internal, Product`, `Internal, GTM`, `External, Third-party`) or legacy `Internal`/`External`; movement rows additionally store `movement_date`, `from_release`, `to_release`, `related_snapshot_date`. RLS: read = all authenticated, insert = PM/PRODUCT_OPS/CPO/SUPERADMIN (matches `roadmap.movementNote.write`), update/delete = author of the row only.

#### Roadmap RPCs (Supabase functions)
All ported from RRV with ClearGo-aligned table names:
- `get_latest_and_previous_roadmap_versions()` — returns `gtm_module`, `gtm_name`, `aha_promoted_ideas_votes` alongside legacy pivot columns for the live snapshot comparison path
- `get_weekly_roadmap_changes(releases)`, `get_quarter_to_date_roadmap_changes(releases)`, `get_year_to_date_roadmap_changes(releases)`
- `get_all_year_release_movements(as_of_date)`, `get_year_movements_with_impact(as_of_date)` (also returns `gtm_name`, `gtm_module` for Rewind/drilldown display), `get_year_movements_impact_summary(as_of_date)`
- `get_release_delivery_metrics(target_release)`, `get_period_release_delivery_metrics(period_type)`
- `get_priority_goals_delivery_metrics(as_of_date)`, `get_strategic_items_detail(category, period, as_of_date)`
- `ensure_roadmap_snapshot_partitions()` — `SECURITY DEFINER`, called from the monthly partition-maintenance cron
- `apply_roadmap_snapshot_gtm_from_pivot(p_updates jsonb, p_force boolean)` — bulk-updates `gtm_module` / `gtm_name` per `aha_key` for backfill jobs (`service_role` only)

---

## User Flows

### Flow 1: Epic Creation from Aha!
1. Aha! webhook triggers on epic update
2. System verifies webhook secret
3. System checks filter criteria (Launch Candidate = true OR tag contains "LaunchConsole")
4. System fetches full epic details from Aha! API
5. System maps Aha! fields to ClearGO schema
6. System checks if release exists, creates if missing
7. System upserts epic in ClearGO
8. System instantiates all applicable criteria with NOT_SET
9. System assigns decision owners based on roster
10. System writes back readiness status to Aha!

### Flow 2: Criterion Status Update
1. User navigates to epic detail page
2. User views readiness matrix
3. User clicks on criterion status (traffic light)
4. System checks user permissions (decision owner or Product Ops)
5. User selects new status (GO/CONDITIONAL/NO_GO)
6. If CONDITIONAL, user enters condition details
7. User adds notes (optional)
8. System saves status update
9. System recalculates readiness score
10. System recalculates verdict
11. System recalculates risk level
12. System logs audit entry
13. System triggers notifications if needed
14. System writes back to Aha! if status changed

### Flow 3: Go/No-Go Decision
1. User navigates to epic detail page
2. User reviews all gate criteria
3. User reviews readiness score vs. tier threshold
4. User clicks "Take Snapshot" button
5. System serializes current epic state
6. User selects decision type (GO_NO_GO_MEETING)
7. User selects verdict (GO/CONDITIONAL_GO/NO_GO)
8. User enters notes explaining decision
9. System creates snapshot
10. System updates epic readiness_status
11. System updates last_go_no_go_decision_date
12. System writes back to Aha!
13. System sends notifications to stakeholders

### Flow 4: Stale Criterion Reminder
1. Scheduled job runs daily (`GET/POST /api/jobs/stale-criteria`; uses `app_settings.staleness_days`, default 14).
2. System queries criteria where `last_updated_at` is older than staleness window and status is NOT_SET or CONDITIONAL.
3. System identifies decision owners and related epic/criterion data.
4. (Optional) If `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` is set, system generates an AI-powered personalized nudge per criterion (launch name, criterion label, owner, days stale, recent notes).
5. System sends Slack (and email) reminder; Slack message may include the AI nudge and link to epic (`/epics/{id}`).
6. System logs notification.
7. User receives reminder, clicks link to epic, updates criterion; system marks criterion as updated.

### Flow 5: Criteria Due Date Nudges
1. Scheduled job runs daily (`GET/POST /api/jobs/criteria-nudges`).
2. System queries criteria with `condition_due_date` matching:
   - 1 week before today (if `slack_nudge_1_week_before` enabled)
   - Today (if `slack_nudge_on_due_date` enabled)
   - Before today (if `slack_nudge_daily_after_due` enabled)
3. System filters criteria by:
   - **Past Release Exclusion**: Excludes criteria for epics with:
     - Past release dates (from `release_schedule.launch_date`)
     - Released status (`Released_Cohort_1`, `Released_GA`, `Released_Retroed`)
   - **Missing Metrics Exception**: For past releases, includes "Missing Success Metrics" reminders for Product Managers if:
     - Epic has no `epic_success_metrics` entries
     - `epic_success_configs.track_offline = false`
     - Product Manager can be resolved via `resolveProductManagerUserId()`
4. System groups criteria by assignee (one message per user).
5. For each user, system:
   - Sorts criteria by urgency (overdue > due today > due soon)
   - Groups by release (closest future release first, then past releases)
   - Groups by epic within each release
   - Builds release groups with epic subgroups
6. System sends combined Slack notification (if user has `receive_slack_notifications = true`) and email notification (if `email_notifications_enabled` and `email_criteria_nudge` are enabled).
7. System updates `last_nudge_sent_at` for all criteria in the notification.
8. System logs notifications to `notification_log` table.

### Flow 5: Weekly Digest
1. Scheduled job runs Monday 9:00 AM (configurable)
2. System queries all active epics
3. System filters to TIER_1 and TIER_2
4. System sorts by risk level and days to launch
5. System generates summary email
6. System sends to CPO and Product Leads
7. System logs notification
8. **Release Filtering**:
   - Fetches up to 4 next releases (increased from 2) to ensure important releases with delays are included
   - Filters out past releases from "next releases" section (defensive check)
   - Past releases appear only in "last releases" section
   - Sections ordered: "Next 2 Releases" appears before "Recent Releases"
9. **Title**: "Weekly Release Readiness Status Update" (updated from "Weekly Release Readiness Digest")

### Flow 6: Meeting Transcript Processing
1. User navigates to Meetings page
2. User uploads meeting transcript
3. System stores transcript
4. User clicks "Extract Snippets"
5. System calls AI service to extract relevant snippets
6. System links snippets to criteria based on relevance
7. System displays snippets in meeting detail
8. User can manually link snippets to criteria
9. Snippets appear in criterion detail view

---

## Integrations

### Aha! Integration

#### Inbound (Webhook)
- **Endpoint**: `/api/integrations/aha/webhook`
- **Authentication**: HMAC signature verification with shared secret
- **Filter**: Process epics where:
  - `Launch Candidate` custom field = true OR
  - Tags contain "LaunchConsole", "cleargo", "ClearGO", or "ClearGo"
- **Mapping**: Comprehensive field mapping from Aha! to ClearGO (see `aha-launch-console-mapping.yaml`)
- **Standard fields captured**: Includes core epic fields plus `integrations` (available as a standard field in Aha!)
- **Auto-Fetch**: Automatically fetches release information if not in system
- **Idempotency**: Safe to process same epic multiple times

#### Outbound (Write-Back)
- **Trigger**: On readiness recompute or decision snapshot creation
- **Idempotency**: Only sends updates when values changed since last sync
- **Fields Written**:
  - Launch Readiness Status
  - Launch Readiness Score (%)
  - Launch Risk
  - Launch Go/No-Go Date
  - Launch Console URL
- **Retry Logic**: Automatic retries with exponential backoff

#### Weekly Roadmap Pivot Snapshot Job
- **Endpoint**: `/api/jobs/roadmap-snapshot` (POST + GET, both bearer-auth with `CRON_SECRET`)
- **Trigger**: GitHub Actions cron `0 8 * * 1` (Mondays 08:00 UTC), defined in `.github/workflows/roadmap-snapshot.yml`
- **Source**: Aha! custom-pivot REST endpoint at `bookmarks/custom_pivots/$AHA_ROADMAP_PIVOT_ID?view=list`
- **Pipeline**:
  1. Paginated fetch via `src/lib/aha/pivotFetch.ts` (reuses standard Aha! retry/backoff)
  2. Normalize each cell with `src/lib/aha/pivotNormalizer.ts` (handles `rich_value` object/array/string forms, html/text fallbacks, `Epic progress bar` percentage extraction, and `aha_key` regex from the first column's HTML link)
  3. Map normalized columns to DB columns via `src/lib/aha/pivotMapping.ts` (regex-driven for the year-tagged "Primary Goal" column)
  4. Resolve `epic_id` per row via batched `aha_id` lookup against `epic`
  5. Batch insert into `roadmap_snapshot` (chunks of 150)
  6. Return summary: `{ rows_inserted, unmatched_aha_keys, unmatched_sample[] }`
- **GTM backfill (manual / one-off)**: `POST` or `GET` `/api/jobs/roadmap-snapshot-backfill-gtm` with the same `CRON_SECRET` bearer auth. Pulls the live pivot (same mapping as weekly intake) and updates **all** `roadmap_snapshot` rows per `aha_key` via `public.apply_roadmap_snapshot_gtm_from_pivot`. Default **merge** mode uses `COALESCE(pivot, existing)` so empty pivot cells do not erase stored values; `?force=true` mirrors pivot exactly (including NULL). **`dry_run=true`** returns pivot epic counts only. Labels are **current** pivot values applied to historical rows (not true point-in-time GTM history).
- **Partition Maintenance**: monthly `/api/jobs/ensure-snapshot-partitions` calls `public.ensure_roadmap_snapshot_partitions()` to keep the calendar covered
- **Replaces**: a standalone n8n workflow that previously fed RRV's `roadmap` table

#### Sync API
- **Manual Sync**: `/api/integrations/aha/sync` - Sync all or filtered epics
- **Release Sync**: `/api/integrations/aha/sync-releases` - Sync release schedule
  - **Date Filtering**: Accepts `start_date` parameter to only sync releases with launch dates on or after the specified date
  - **Date Priority**: Uses "Releases date (external)" custom field as primary date source, falls back to `end_date`, then `start_date`
  - **Date Picker UI**: Admin interface includes modal with date picker for selecting starting date before sync
- **Field Sync**: `/api/settings/aha-fields/sync` - Sync Aha! field mappings
- **Release Refresh Optimization**: When a `release` query param is provided, the sync endpoint fetches epics directly from Aha! for that release and revalidates only the epics currently shown (via `existingAhaIds`), avoiding a full epic list scan.
- **Batch Delete API**: `/api/releases/batch-delete` - Delete multiple releases at once (POST with array of release IDs)

### Product Manager API

#### Product Manager Resolution
- **GET** `/api/epics/[id]/product-manager` - Get product manager user ID for an epic (resolves from epic owner and pod mapping)

#### Criterion delegation (per epic)
- **POST** `/api/epics/[id]/criteria/clear-delegation` - Clears `decision_owner_id` on `epic_criterion_status` for the given criterion **labels** on that epic so the matrix “Accountable” column falls back to the criterion template (`decision_owner_email`). Requires `criteria.delegate`. Body: `{ "labels": string[] }` (exact label match). Returns counts and cleared status row IDs.
- **POST** `/api/criteria/clear-accountable-delegation` - Clears `decision_owner_id` wherever it points at a given `app_user` (by **accountable email**), scoped to one or more **epic IDs** and optionally to specific **criterion labels**. Requires `criteria.delegate`. Body: `{ "accountableEmail": string, "epicIds": string[], "criterionLabels"?: string[] }`. Omit `criterionLabels` to remove that person’s delegation on all criteria rows for those epics.

### Jira Integration

#### Epic Key Discovery
- **Primary Method**: Search Jira API by epic name to find matching Jira epics
- **Fallback Method**: Extract Jira epic key from Aha! integrations field
- **Caching**: Discovered epic keys are cached in the `jira_epic_key` field for performance
- **API Endpoint**: `GET /api/epics/[id]/jira-epic-key` - Returns Jira epic key with source information
- **Usage**: Enables Jira JQL data sources in criteria to link to Jira tickets
- **Configuration**: Requires Jira domain, email, and API token in Settings > Integrations > Jira
- **Documentation**: See `docs/jira-epic-key-methodology.md` for detailed methodology

#### Jira JQL Data Sources
- Criteria can use `jira_jql` data source type to link to Jira tickets
- JQL templates support `{{JIRA_EPIC}}` placeholder that gets replaced with the epic key
- Example: `parent = {{JIRA_EPIC}} and statusCategory != Done`
- Links are displayed in the CommentsModal for easy access to Jira tickets

### ROVO Integration

#### Overview
✅ **IMPLEMENTED** - ROVO (Atlassian's AI assistant) integration for searching and summarizing Jira issues and Confluence pages.

#### Architecture
- **Protocol**: Uses Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **Transport**: StreamableHTTPClientTransport (serverless-compatible, replaces deprecated SSE transport)
- **Authentication**: OAuth 2.1 with dynamic client registration
- **Server**: ROVO MCP Server at `https://mcp.atlassian.com/v1/mcp`

#### Features
- **Search**: Search across Jira issues and Confluence pages
- **Summarize**: Generate summaries of specific Jira issues or Confluence pages
- **OAuth Flow**: Secure OAuth authentication with token refresh support
- **Connection Management**: Test connection status and disconnect functionality

#### Configuration
- **Settings Page**: `/admin/settings/integrations/rovo`
- **Required Environment Variables**:
  - `ROVO_OAUTH_CLIENT_ID` or `ATLASSIAN_OAUTH_CLIENT_ID`
  - `ROVO_OAUTH_CLIENT_SECRET` or `ATLASSIAN_OAUTH_CLIENT_SECRET`
- **OAuth Scopes**: `read:jira-work`, `read:jira-user`, `read:confluence-content.summary`, `read:confluence-space.summary`, `offline_access`
- **Callback URL**: `/api/integrations/rovo/oauth`

#### API Endpoints
- **Search**: `POST /api/integrations/rovo/search` - Search Jira/Confluence content
- **Summarize**: `POST /api/integrations/rovo/summarize` - Summarize specific content
- **Status**: `GET /api/integrations/rovo/status` - Check connection status
- **Disconnect**: `POST /api/integrations/rovo/disconnect` - Disconnect ROVO integration
- **OAuth**: `GET /api/integrations/rovo/oauth` - OAuth initiation and callback handler

#### Implementation Details
- **MCP Client**: `src/lib/rovo/mcp-client.ts` - MCP SDK client wrapper with OAuth provider
- **Client Library**: `src/lib/rovo/client.ts` - High-level search/summarize functions
- **OAuth Provider**: Implements `OAuthClientProvider` interface for MCP SDK OAuth flow
- **Token Storage**: Tokens stored in `app_settings` table (`rovo_access_token`, `rovo_refresh_token`, `rovo_token_expires_at`)
- **Serverless Compatibility**: Uses StreamableHTTPClientTransport instead of SSE for better serverless support

#### Documentation
- Setup guide: `docs/rovo-setup.md`
- See `src/lib/rovo/` for implementation details

### Slack Integration

#### Slash Commands
- `/launch-status [name or aha-id]`: Get launch status
- `/my-launches`: View user's launches
- `/launch-summary [tier] [risk]`: Get launch summary
- `/update-criterion [launch-id] [criterion-id] [status]`: Update criterion

#### Event Subscriptions
- **App Home**: Personalized dashboard
- **App Mentions**: Respond to mentions
- **Direct Messages**: Interactive conversations
- **Link Sharing**: URL unfurling for launch links

#### Interactive Components
- **Buttons**: Quick actions (Update Status, View Details)
- **Dropdowns**: Status selection
- **Modals**: Forms for status updates

#### Notifications
- **Stale Criterion Reminders**: Daily reminders (job: `/api/jobs/stale-criteria`); may include an AI-generated personalized nudge when Gemini is configured.
- **Criteria Due Date Nudges**: Daily reminders (job: `/api/jobs/criteria-nudges`) for criteria approaching or past due dates:
  - Sent 1 week before, on due date, and daily after overdue
  - Grouped by release (closest future first), then by epic, sorted by urgency
  - Excludes past releases except for missing metrics reminders to PMs
  - Supports both Slack and email delivery channels
- **Risk Alerts**: High-risk launch notifications
- **Go/No-Go Decisions**: Decision notifications
- **Weekly Digest**: Leadership summary

### Google Calendar Integration

#### OAuth Flow
1. User clicks "Connect Google Calendar"
2. System redirects to Google OAuth
3. User authorizes access
4. System stores access/refresh tokens
5. System marks integration as active

#### Sync Process
1. User clicks "Sync Calendar"
2. System fetches events from Google Calendar
3. System creates meetings for events
4. System links meetings to epics if title matches
5. System displays meetings in Meetings page

#### Meeting Creation
- **Automatic**: From calendar sync
- **Manual**: User creates meeting manually
- **Linking**: Link meetings to one or more epics

### Email Integration (Resend)

#### Email Types
- **Stale Criterion Reminders**: Daily
- **Criteria Due Date Nudges**: Daily reminders for criteria approaching or past due dates, grouped by release and epic
- **Weekly Digest**: Weekly
- **Risk Alerts**: On-demand
- **Go/No-Go Notifications**: On snapshot creation
- **Status Change Notifications**: On readiness status change

#### Email Templates
- **Configurable**: Admin can configure templates
- **Variables**: Support for dynamic content
- **Branding**: ClearGO branding

---

## Security & Permissions

### Authentication
- **Provider**: Supabase Auth
- **Methods**:
  - **Google OAuth**: Primary method for signed-in users
  - **Magic Link**: Passwordless sign-in via email link; session stored in custom `lr_session` cookie; supported by `/api/auth/magic-link`, `/api/auth/verify`
  - **Password**: Invitation and reset flows; `/setup-password`, `/reset-password`, `/api/auth/setup-password`, `/api/auth/resend-invitation`; Supabase verify token for reset
- **Session Management**: Server-side sessions with cookies; APIs accept both Supabase session and magic-link session
- **Token Refresh**: Automatic token refresh
- **Logout**: `/api/auth/signout` endpoint

### Authorization (RBAC)

#### Roles
- **SUPERADMIN**: Full access including impersonation; receives feedback notifications; same administrative scope as CPO/PRODUCT_OPS
- **CPO**: Full access, settings management
- **PRODUCT_LEAD**: Portfolio view, epic management
- **PM**: Epic ownership, criterion updates
- **PMM**: Marketing criteria ownership
- **ENG_LEAD**: Engineering criteria ownership
- **SUPPORT_LEAD**: Support criteria ownership
- **SECURITY**: Security criteria ownership
- **LEARNING**: Learning criteria ownership
- **PRODUCT_OPS**: Admin access, settings, criteria management
- **OTHER**: Read-only access

**Capability model**: In addition to role-based access, the app uses a capability matrix (e.g. `criteria.status.update`, `analytics.read`, `users.read`) configurable per role in Admin > Settings > Permissions. Access to specific features (e.g. Analytics dashboard, user management) is determined by these capabilities.

**Roadmap-rewind capabilities** (universal *read* — every authenticated user sees Roadmap Snapshot, Roadmap Rewind, and the Confidence tab; only adjustment/write controls are role-gated):
- `roadmap.confidence.adjust` — PM / PRODUCT_OPS / CPO (plus SUPERADMIN)
- `roadmap.impactOverride.write` — PM / PRODUCT_OPS / CPO (plus SUPERADMIN)
- `roadmap.hiddenItem.write` — all roles (per-user preference; RLS still scopes writes to the owner)
- `roadmap.movementNote.write` — PM / PRODUCT_OPS / CPO (plus SUPERADMIN). Authoritative gate is the `epic_comment_insert_pm` RLS policy (migration 20260430120000); the UI helper `canEditRoadmap()` mirrors this for client-side affordances. Once a note is created, the author can still edit/delete their own row even if their role changes later.
- `roadmap.analysis.generate` — CPO / PRODUCT_OPS (plus SUPERADMIN): generate or regenerate cached Plan vs Actual AI narrative (`POST /api/analytics/plan-vs-actual/analysis`). Viewing the report still requires `analytics.read`.

#### Permissions Matrix

| Action | SUPERADMIN | CPO | PRODUCT_LEAD | PM | PMM/ENG/SUPPORT/SECURITY/LEARNING | PRODUCT_OPS | OTHER |
|--------|------------|-----|--------------|----|----------------------------------|-------------|-------|
| View Portfolio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Epic Detail | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Epic | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Edit Epic | ✅ | ✅ | ✅ | Owner only | ❌ | ✅ | ❌ |
| Delete Epic | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Update Criterion Status | ✅ | ✅ | ✅ | Decision owner | Decision owner | ✅ | ❌ |
| Create Snapshot | ✅ | ✅ | ✅ | Owner | ❌ | ✅ | ❌ |
| Manage Criteria | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Manage Settings | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Manage Users | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| View Audit Log | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| View Meetings | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Impersonate User | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View Analytics | ✅ | ✅ | If permitted | If permitted | If permitted | ✅ | If permitted |

### Row-Level Security (RLS)
- **Epic**: All authenticated users can read, owners/Product Ops/CPO can write
- **Criterion**: All authenticated users can read, Product Ops/CPO can write
- **Epic Criterion Status**: All authenticated users can read, decision owners/Product Ops can write
- **Settings**: Product Ops/CPO only
- **Audit Log**: Product Ops/CPO only
- **User Management**: Product Ops/CPO only
- **roadmap_snapshot / roadmap_delay_history**: All authenticated users can read; inserts only via service role (cron job)
- **confidence_rating**: All authenticated users can read; updates restricted to PM/PRODUCT_OPS/CPO/SUPERADMIN
- **confidence_adjustment_history**: All authenticated users can read; inserts restricted to PM/PRODUCT_OPS/CPO/SUPERADMIN (append-only)
- **pm_impact_override**: All authenticated users can read; insert/update/delete restricted to PM/PRODUCT_OPS/CPO/SUPERADMIN
- **roadmap_hidden_item**: All authenticated users can read; insert/delete only for the owning `app_user`
- **roadmap_visit**: All authenticated users can read; insert/update gated to the visitor's own `app_user_id` via RLS (defense in depth) — the actual write goes through the service-role API route so it works for magic-link users too
- **epic_comment**: All authenticated users can read; insert restricted to PM/PRODUCT_OPS/CPO/SUPERADMIN (policy `epic_comment_insert_pm`, migration 20260430120000); update/delete restricted to the row's `created_by` (so authors can clean up their own past notes after a role change)

### Data Protection
- **HTTPS**: All traffic encrypted
- **Input Validation**: All inputs validated with Zod
- **SQL Injection**: Parameterized queries only
- **XSS Protection**: React automatic escaping
- **CSRF Protection**: SameSite cookies
- **Rate Limiting**: API rate limiting
- **Secrets Management**: Environment variables, never in code

---

## Non-Functional Requirements

### Performance
- **Page Load Time**: < 2 seconds for portfolio view
- **API Response Time**: < 500ms for most endpoints
- **Database Queries**: Optimized with indexes
- **Concurrent Users**: Support 50-100 concurrent users
- **Data Volume**: Support 1000+ epics, 100+ criteria

### Scalability
- **Horizontal Scaling**: Stateless API design
- **Database Scaling**: Supabase managed scaling
- **Caching**: React Query for client-side caching
- **CDN**: Vercel edge network

### Reliability
- **Uptime**: 99.9% target
- **Error Handling**: Comprehensive error handling
- **Retry Logic**: Automatic retries for external APIs
- **Monitoring**: Error tracking and logging
- **Backups**: Supabase automatic backups

### Usability
- **Responsive Design**: Mobile, tablet, desktop
- **Accessibility**: WCAG 2.1 AA compliance
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Fonts**: Atkinson Hyperlegible (headings), Public Sans (body)
- **Dark Mode**: Mantine theme support

### Maintainability
- **Code Quality**: TypeScript strict mode
- **Testing**: Unit tests, integration tests, E2E tests
- **Documentation**: Inline comments, README, API docs
- **Version Control**: Git with semantic versioning
- **Migrations**: Versioned database migrations

---

## Future Enhancements

### Phase 2 Features
1. **Advanced Analytics**: Enhanced success metrics visualization, trend analysis
2. **Custom Dashboards**: User-configurable dashboards
3. **Workflow Automation**: Advanced workflow rules
4. **AI-Powered Insights**: LLM-based summaries and recommendations
5. **Mobile App**: Native iOS/Android apps
6. **API for Third-Party Tools**: Public API for integrations
7. **Advanced Reporting**: Custom report builder
8. **Templates**: Launch template library
9. **Bulk Operations**: Bulk status updates, bulk assignments
10. **Advanced Filtering**: Saved filters, filter presets

### Integration Enhancements
1. **Jira Integration**: ✅ **IMPLEMENTED** - Jira epic key discovery and ticket tracking
   - Epic key discovery via Jira API search and Aha! integrations field fallback
   - Jira JQL data source support for criteria
   - Cached epic keys for performance
   - See `docs/jira-epic-key-methodology.md` for details
2. **ROVO Integration**: ✅ **IMPLEMENTED** - Atlassian AI assistant integration
   - MCP SDK-based integration for searching and summarizing Jira/Confluence content
   - OAuth 2.1 authentication with dynamic client registration
   - StreamableHTTPClientTransport for serverless compatibility
   - See `docs/rovo-setup.md` for setup instructions
3. **Salesforce Integration**: Sync with Salesforce for GTM tracking
4. **Confluence Integration**: Link to Confluence documentation
5. **GitHub Integration**: Link to GitHub repositories
6. **Zoom Integration**: Automatic meeting transcript extraction

### AI/ML Features
1. **AI Checklist Pruning** — ✅ **IMPLEMENTED**: When criteria are instantiated for an epic, Gemini suggests which may be irrelevant (from name/description/tags). Suggestions appear in the Readiness tab via the AI Checklist Suggestions banner; users can approve (mark N/A) or dismiss. See §2.5 and `src/lib/ai/client.ts` (`pruneCriteria`).
2. **AI-Powered Stale Nudges** — ✅ **IMPLEMENTED**: The daily stale-criteria job can attach a short, context-aware AI-generated nudge to each Slack/email reminder (launch, criterion, owner, staleness). Requires Gemini API key. See §10.1–10.2, Flow 4, and `src/lib/ai/client.ts` (`generateSmartNudge`).

3. **Criteria Due Date Nudges** — ✅ **IMPLEMENTED**: Daily job (`/api/jobs/criteria-nudges`) sends reminders for criteria based on due dates:
   - **Frequency**: 1 week before, on due date, and daily after overdue
   - **Grouping**: All criteria for a user grouped into single message, organized by release (closest future first), then by epic, sorted by urgency
   - **Channels**: Supports both Slack and email notifications (configurable per user and system-wide)
   - **Past Release Filtering**: Excludes criteria reminders for past releases and released epics
   - **Missing Metrics Reminders**: For past releases, sends "Missing Success Metrics" reminders to Product Managers when:
     - Epic has no success metrics configured (`epic_success_metrics` empty)
     - `track_offline = false` in `epic_success_configs`
     - Uses "Success Defined" criterion due date if available, otherwise today's date
   - **Implementation**: See `src/app/api/jobs/criteria-nudges/route.ts`, `src/lib/slack/templates.ts` (`buildCriteriaNudgeMessage`), and `src/lib/email/templates.ts` (`getCriteriaNudgeEmail`)
3. **Predictive Risk Scoring**: ML-based risk prediction
4. **Natural Language Processing**: Extract criteria from meeting notes
5. **Sentiment Analysis**: Analyze feedback sentiment
6. **Recommendation Engine**: Suggest criteria based on epic type

---

## Appendix

### A. Glossary
- **Epic**: A product launch or feature release (synonymous with "Launch")
- **Criterion**: A readiness requirement that must be met
- **Gate Criterion**: A blocking criterion that prevents GO if NO_GO
- **Readiness Score**: Percentage of criteria that are GO (0-100%)
- **Verdict**: Overall launch decision (GO, CONDITIONAL_GO, NO_GO)
- **Risk Level**: Assessment of launch risk (LOW, MEDIUM, HIGH)
- **Tier**: Launch importance level (TIER_1, TIER_2, TIER_3)
- **Snapshot**: Point-in-time record of launch state for decision tracking
- **Success Scorecard**: Daily snapshot of post-launch success metrics vs targets/thresholds
- **Retrospective**: Post-launch review at T+30, T+60, T+90 days
- **Success Metric**: Measurable indicator of launch success (adoption, revenue, retention, etc.), with per-tier thresholds and per-epic targets

### B. Acronyms
- **CPO**: Chief Product Officer
- **GTM**: Go-To-Market
- **PM**: Product Manager
- **PMM**: Product Marketing Manager
- **RLS**: Row-Level Security
- **RBAC**: Role-Based Access Control
- **API**: Application Programming Interface
- **OAuth**: Open Authorization
- **JSONB**: JSON Binary (PostgreSQL data type)
- **UUID**: Universally Unique Identifier

### C. References
- Aha! Integration Mapping: `docs/launch-readiness/aha-launch-console-mapping.yaml`
- Implementation Plan: `docs/launch-readiness/Launch-Readiness-Console-Plan.md`
- Slack Integration: `docs/launch-readiness/slack-integration-setup.md`
- Feedback System: `docs/feedback-system-implementation.md`
- Activity Feed: `docs/activity-feed-implementation.md`
- Jira Epic Key: `docs/jira-epic-key-methodology.md`
- HEART Framework: `src/lib/heart/` (types, service, agent, snapshot-calculator, happiness-automation, pendo-context, data-confidence)
- Admin Impersonation: `src/lib/auth/impersonation.ts`, `src/components/ImpersonationBanner.tsx`, `src/app/api/admin/impersonate/`
- Analytics: `src/app/(dashboard)/analytics/page.tsx`, `src/app/(dashboard)/analytics/AnalyticsDashboardClient.tsx`, `src/lib/services/analyticsService`, `src/lib/services/planVsActualService.ts`, `src/app/api/analytics/`

---

**Document Status**: Complete  
**Last Updated**: February 2026  
**Next Review**: As needed

