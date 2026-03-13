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
- **Feedback**: Accessible via the global Feedback page; feedback can optionally be linked to a specific epic
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
- **Pendo Integration**: Admin configuration for Pendo API integration
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
- **HEART Dashboard**: Epic-level dashboard shows config, metrics with latest snapshot, trend, milestone progress, measurement period; list view of epics with HEART and overall status
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
- **Feedback Entry**: Manual feedback entry from a global Feedback page, with optional epic linking
- **Feedback Types**:
  - EPIC: Feedback tied to a specific epic (or “Product” when no epic name is available for display)
  - PROCESS: Feedback about workflows/process
  - TOOL: Feedback about internal tools (including ClearGO itself)
- **Feedback Attribution**: Track who provided feedback
- **Feedback Source**: Track source (manual, Slack, email, meeting, Aha!)
- **Feedback Display**: Chronological list of all feedback
- **Feedback Metrics**: Count feedback per epic for performance tracking

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
- **Due Date Tracking**: Show condition due dates
- **Overdue Indicators**: Highlight overdue items
- **Status Summary**: Count of items by status
- **Quick Actions**: Direct links to update status

#### 6.2 Personal Metrics
- **Pending Items**: Count of items requiring attention
- **Overdue Count**: Count of overdue criteria
- **Recent Updates**: Recently updated items

### 6A. Analytics Dashboard

- **Route**: `/analytics` (dashboard analytics page)
- **Access**: Gated by capability `analytics.read` (assigned via Admin > Settings > Permissions); SUPERADMIN, CPO, PRODUCT_OPS and other roles can be granted this capability
- **Performance**: Tabbed interface with lazy loading - only loads data for the active tab to improve initial page load performance
- **Tabs**:
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
- **Views**: Snapshot (current period) vs trends (time-series over configurable months); filters apply to all cards
- **APIs**: 
  - Launch Metrics: `GET /api/analytics/success-plan-completion`, `GET /api/analytics/retro-completion`, `GET /api/analytics/launch-hygiene` (optional query params: tier, pod, date_range_start, date_range_end, trends, months_back)
  - Timeliness: `GET /api/analytics/criteria-timeliness`, `GET /api/analytics/pm-timeliness` (optional query params: tier, pod, date_range_start, date_range_end)
  - Usage: `GET /api/analytics/usage?metric={adoption|stickiness|by-role|trends}` (optional query params: date_range_start, date_range_end, role, days_back)
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
- **Pendo Integration**: Configure Pendo API integration for automatic metric data
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
- **Criteria Due Date Nudges**: Daily job (`/api/jobs/criteria-nudges`) sends Slack and email reminders for criteria based on due dates:
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

The epic detail timeline renders phases as colored duration bars and milestones as diamond markers; a lighter "Cohort 1 Feedback" bar spans the period between Cohort 1 release and GA. Criterion due dates use the appropriate stage set and, for UI Rollout, level-aware durations when the epic has a UI/UX Impact level.

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
- Analytics: `src/app/(dashboard)/analytics/page.tsx`, `src/lib/services/analyticsService`, `src/app/api/analytics/`

---

**Document Status**: Complete  
**Last Updated**: February 2026  
**Next Review**: As needed

