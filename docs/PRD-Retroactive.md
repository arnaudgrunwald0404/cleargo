# ClearGO Launch Readiness Console - Product Requirements Document (Retroactive)

**Version:** 1.0  
**Date:** January 2025  
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
14. [Epic Watching / My Scope](#epic-watching--my-scope)
15. [Future Enhancements](#future-enhancements)

---

## Executive Summary

**ClearGO** (Launch Readiness Console) is an internal web application designed to replace spreadsheet-based launch readiness management with a structured, intelligent control tower for product launches. The system manages launch readiness across ~15 products/pods, automatically calculates readiness scores, enforces gating rules, integrates with Aha! for roadmap synchronization, and provides real-time visibility into launch status and risks.

**Key Value Propositions:**
- Single source of truth for launch readiness across all products
- Automated readiness scoring and risk assessment
- Real-time collaboration and stakeholder accountability
- Integration with existing tools (Aha!, Slack, Google Calendar)
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
- Weekly leadership digests

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
- **My Scope Filter**: Filter to epics the user is watching (epic watches)
- **Sorting**: By date, risk, readiness score, name
- **Search**: Full-text search across epic names
- **Release Grouping**: Group epics by release schedule
- **Visual Indicators**: Color-coded risk levels, readiness scores, gate status
- **Epic Watching**: Users can watch/unwatch epics to personalize their view

#### 1.2 Epic Detail Page
- **Header Information**: Name, product, tier, dates, status, readiness score, risk level
- **Readiness Matrix**: Interactive matrix of all criteria grouped by category
- **Gate Summary**: Count of gate criteria by status (GO/CONDITIONAL/NO_GO/NOT_SET)
- **Timeline View**: T-based milestones (T-90, T-30, T+30, T+90)
- **Owner Information**: Epic owner, decision owners per criterion
- **Aha! Integration**: Link to Aha! epic, sync status
- **Comments & Attachments**: Per-criterion discussion and file attachments
- **Feedback Section**: Post-launch feedback collection
- **Activity History**: Timeline of all changes

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
  - Decision owner role
  - Status definitions (GO/CONDITIONAL/NO_GO)
  - Sort order
- **Auto-Instantiation**: Criteria automatically instantiated for new epics based on tier
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
- **Benchmark Selection**: PMs select adoption benchmarks matching epic tier (TIER_1, TIER_2, TIER_3)
- **Metric Mapping**: PMs select 3-7 success metrics to track (adoption, revenue, retention, enablement, friction)
- **Post-Launch Owner Assignment**: Assign post-launch owner responsible for monitoring
- **Delegated Post-Launch Owner**: Delegate post-launch owner responsibility to another user (similar to criterion delegation)
- **Config Locking**: Auto-locks when epic status becomes "GO" (prevents changes except by admins)
- **Admin Override**: Admins can modify locked configs with audit logging

#### 5.2 Success Scorecards
- **Daily Snapshots**: Automated daily scorecard generation for launched epics with locked configs
- **Metric Tracking**: Tracks actual vs expected values for each configured metric
- **Benchmark Comparison**: Compares adoption curves against selected benchmark
- **Status Calculation**: Overall status (ON_TRACK, AT_RISK, MISSED) based on metric performance
- **Data Sources**: Integrates with Pendo, Snowflake, and manual entry
- **Alerts**: Automatic alerts when scorecard status is AT_RISK or MISSED

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
- **Benchmark Management**: Admins can create/edit adoption benchmarks by tier and feature type
- **Metric Catalog**: Admins can create/edit success metrics with thresholds and data sources
- **Pendo Integration**: Admin configuration for Pendo API integration
- **Settings UI**: Admin pages for managing benchmarks, metrics, and integrations
- **Feedback Metrics**: Track feedback count per epic
- **Performance Indicators**: 
  - Green: 5+ feedback items (high engagement)
  - Yellow: 2-4 feedback items (moderate engagement)
  - Red: 1 feedback item (low engagement)
  - Gray: 0 feedback items (no feedback)
- **Time Window**: Track epics launched within last 180 days
- **Release Grouping**: Group by release schedule

#### 5.6 Standard Metrics and Benchmarks

The system includes 10 pre-configured success metrics based on industry-standard SaaS metrics for software launches:

**ADOPTION Metrics:**
1. **Feature Activation Rate** - Percentage of users who activate/use a new feature
   - Typical benchmarks: 20-40% within 30 days, 40-60% within 90 days
   - Tier thresholds: TIER_1 (60%), TIER_2 (45%), TIER_3 (25%)
   - Leading indicator

2. **Time to First Value (TTFV)** - Days until user achieves first meaningful outcome
   - Typical benchmarks: 1-7 days for simple features, 7-30 days for complex features
   - Tier thresholds: TIER_1 (max 3 days), TIER_2 (max 7 days), TIER_3 (max 14 days)
   - Leading indicator

3. **Daily Active Users / Monthly Active Users (DAU/MAU)** - Engagement frequency ratio
   - Typical benchmarks: 20-40% DAU/MAU ratio indicates strong engagement
   - Tier thresholds: TIER_1 (40%), TIER_2 (30%), TIER_3 (20%)
   - Leading indicator

**REVENUE Metrics:**
4. **Monthly Recurring Revenue (MRR) Growth** - Month-over-month revenue growth
   - Typical benchmarks: 10%+ MoM for early-stage, 3% MoM for established
   - Tier thresholds: TIER_1 (10%), TIER_2 (5%), TIER_3 (3%)
   - Lagging indicator

5. **Net Revenue Retention (NRR)** - Revenue retained from existing customers
   - Typical benchmarks: 110-120% is strong, 125%+ is world-class
   - Tier thresholds: TIER_1 (125%), TIER_2 (115%), TIER_3 (110%)
   - Lagging indicator

6. **Average Revenue Per User (ARPU)** - Average revenue generated per user
   - Typical benchmarks: Varies by segment; growth indicates pricing success
   - Tier thresholds: TIER_1 (min $100), TIER_2 (min $50), TIER_3 (min $25)
   - Lagging indicator

**RETENTION Metrics:**
7. **Customer Churn Rate** - Percentage of customers who cancel subscriptions
   - Typical benchmarks: 4-7% annually is healthy
   - Tier thresholds: TIER_1 (max 4%), TIER_2 (max 6%), TIER_3 (max 7%)
   - Lagging indicator

8. **Feature Stickiness** - Percentage of users who use feature multiple times
   - Typical benchmarks: 30-50% return within 7 days indicates stickiness
   - Tier thresholds: TIER_1 (50%), TIER_2 (40%), TIER_3 (30%)
   - Leading indicator

**ENABLEMENT Metrics:**
9. **Onboarding Completion Rate** - Percentage completing setup/onboarding
   - Typical benchmarks: 60-80% completion indicates good UX
   - Tier thresholds: TIER_1 (80%), TIER_2 (70%), TIER_3 (60%)
   - Leading indicator

10. **Support Ticket Volume** - Number of support requests per user per month
    - Typical benchmarks: <0.1 tickets/user/month is excellent
    - Tier thresholds: TIER_1 (max 0.05), TIER_2 (max 0.1), TIER_3 (max 0.2)
    - Leading indicator

**Standard Adoption Benchmarks:**

The system includes default adoption benchmarks for each launch tier based on industry standards:

**TIER_1 (High-Impact Features):**
- Day 30: 35% activation
- Day 60: 55% activation
- Day 90: 65% activation
- TTFV: 2 days
- Usage Depth: 3.5-4.5 sessions per week

**TIER_2 (Medium-Impact Features):**
- Day 30: 25% activation
- Day 60: 40% activation
- Day 90: 50% activation
- TTFV: 5 days
- Usage Depth: 2.5-3.5 sessions per week

**TIER_3 (Low-Impact/Niche Features):**
- Day 30: 15% activation
- Day 60: 25% activation
- Day 90: 35% activation
- TTFV: 10 days
- Usage Depth: 1.5-2.5 sessions per week

These defaults can be customized per epic or feature type, and additional benchmarks can be created for specific use cases.

#### 4.2 Feedback Collection
- **Feedback Entry**: Manual feedback entry per epic
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

#### 9.2 Settings Management
- **Per-Tier Thresholds**: Configure readiness thresholds per tier
- **Staleness Window**: Configure days before criterion considered stale (default: 14)
- **Digest Schedule**: Configure weekly leadership digest schedule (default: Monday 9:00 AM)
- **Email Allowlist**: Configure allowed email domains (default: clearcompany.com)
- **Fallback User**: Configure fallback Product Ops user
- **Timezone**: Configure company timezone
- **Pod Order**: Configure user-defined order of pods for consistent display throughout the app
- **Aha! Configuration**:
  - Webhook secret
  - Fields to load
  - Tags filter
  - Webhook URL
- **Slack Configuration**:
  - Bot token
  - Signing secret
  - App ID
  - Default channel
  - Notification settings
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
- **Benchmark Management**: Create, edit, and manage adoption benchmarks by tier and feature type
- **Metric Catalog**: Create, edit, and manage success metrics with thresholds and data sources
- **Pendo Integration**: Configure Pendo API integration for automatic metric data
- **Snowflake Integration**: Configure Snowflake integration for data warehouse metrics
- **Settings Pages**: Admin UI for managing benchmarks, metrics, and integrations

#### 9.6 Pod Management
- **Pod List**: View all pods
- **Pod Configuration**: Configure pod settings
- **Product-Pod Mapping**: Map products to pods

### 10. Notifications & Reminders

#### 10.1 Email Notifications
- **Stale Criterion Reminders**: Daily reminders for criteria not updated in staleness window
- **Weekly Leadership Digest**: Summary of top launches by tier/risk
- **Risk Alerts**: Alerts when launch enters high-risk status
- **Go/No-Go Notifications**: Notifications when decision snapshots created
- **Status Change Notifications**: Notifications when readiness status changes

#### 10.2 Slack Notifications
- **Slash Commands**:
  - `/launch-status [name or aha-id]`: Get launch status
  - `/my-launches`: View user's launches
  - `/launch-summary [tier] [risk]`: Get launch summary
  - `/update-criterion [launch-id] [criterion-id] [status]`: Update criterion
- **Interactive Messages**: Buttons and dropdowns for quick actions
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

#### 11.2 Launch Stage Phases
The system uses the following launch stage phases:
- **GTM Access** (14 days): Features available and functioning properly. Go/No-Go decision typically happens during this phase.
- **Internal Readiness** (21 days): Product Education documentation and training ready for internal teams.
- **Cohort 1 Live** (28 days): First batch of customers are live with the new feature.
- **GA / Cohort 2 Live** (ongoing): All customers are live with the new feature.

#### 11.3 Date Calculations
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

### 14. Epic Watching / My Scope

#### 14.1 Watch Management
- **Watch/Unwatch Epics**: Users can watch epics to personalize their portfolio view
- **My Scope Filter**: Filter portfolio view to show only watched epics
- **Watch Persistence**: Watches persist across sessions
- **Watch API**: RESTful API endpoints for managing watches (GET, POST, DELETE)

#### 14.2 Watch Functionality
- **Watch Status**: Check if user is watching a specific epic
- **Bulk Operations**: Watch/unwatch multiple epics
- **Watch Indicators**: Visual indicators in UI showing watched status

---

## Technical Architecture

### Frontend Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI Library**: Mantine UI v8
- **Styling**: Tailwind CSS v4
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
- `status` (Enum: PLANNED, PRE_LAUNCH, LAUNCHING, LAUNCHED, POST_LAUNCH, CANCELLED)
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
- `aha_fields` (JSONB) - Full Aha! field mapping
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
- `epic_id` (UUID, Foreign Key → epic)
- `feedback_text` (Text)
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
- `epic_criterion_status_id` (UUID, Foreign Key → epic_criterion_status)
- `comment_text` (Text)
- `created_by` (UUID, Foreign Key → app_user)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

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
- `email_sender` (Text, Default: "noreply@tacticalsync.com")
- `slack_bot_token` (Text)
- `slack_signing_secret` (Text)
- `slack_app_id` (Text)
- `slack_default_channel` (Text)
- `slack_notification_settings` (JSONB)
- `email_templates` (JSONB)
- `enable_activity_feed` (Boolean, Default: true)
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
- `name` (Text, Unique)
- `description` (Text)
- `sort_order` (Integer)
- `created_at` (Timestamp)

#### Meeting Epic Junction
- `id` (UUID, Primary Key)
- `meeting_id` (UUID, Foreign Key → meeting)
- `epic_id` (UUID, Foreign Key → epic)
- `created_at` (Timestamp)

#### Epic Watches
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `user_id` (UUID, Foreign Key → app_user, ON DELETE CASCADE)
- `created_at` (Timestamp)
- UNIQUE(epic_id, user_id)

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
- `thresholds` (JSONB) - Tier-specific thresholds
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Epic Success Configs
- `epic_id` (UUID, Primary Key, Foreign Key → epic, ON DELETE CASCADE)
- `benchmark_id` (UUID, Foreign Key → adoption_benchmarks)
- `post_launch_owner` (UUID, Foreign Key → app_user)
- `delegated_post_launch_owner_id` (UUID, Foreign Key → app_user, Nullable, ON DELETE SET NULL)
- `locked` (Boolean, Default: false)
- `locked_at` (Timestamp, Nullable)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### Epic Success Metrics
- `id` (UUID, Primary Key)
- `epic_id` (UUID, Foreign Key → epic, ON DELETE CASCADE)
- `metric_id` (UUID, Foreign Key → success_metrics, ON DELETE CASCADE)
- `threshold_override` (JSONB, Nullable)
- `created_at` (Timestamp)
- UNIQUE(epic_id, metric_id)

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
1. Scheduled job runs daily
2. System queries criteria where last_updated_at > staleness_days ago
3. System filters to criteria with status != GO
4. System identifies decision owners
5. System sends email/Slack reminder
6. System logs notification
7. User receives reminder
8. User clicks link to update criterion
9. User updates status
10. System marks criterion as updated

### Flow 5: Weekly Leadership Digest
1. Scheduled job runs Monday 9:00 AM (configurable)
2. System queries all active epics
3. System filters to TIER_1 and TIER_2
4. System sorts by risk level and days to launch
5. System generates summary email
6. System sends to CPO and Product Leads
7. System logs notification

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

### Flow 7: Epic Watching / My Scope
1. User navigates to Epic Portfolio View
2. User clicks "Watch" button on an epic
3. System creates epic_watch record linking user to epic
4. User applies "My Scope" filter
5. System filters epics to show only watched epics
6. User can unwatch epics to remove from scope
7. Watch status persists across sessions

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
- **Field Sync**: `/api/settings/aha-fields/sync` - Sync Aha! field mappings

### Epic Watching API

#### Watch Management
- **GET** `/api/epics/[id]/watch` - Check if user is watching an epic
- **POST** `/api/epics/[id]/watch` - Watch an epic
- **DELETE** `/api/epics/[id]/watch` - Unwatch an epic
- **GET** `/api/epics/my-scope` - Get all epics user is watching

### Product Manager API

#### Product Manager Resolution
- **GET** `/api/epics/[id]/product-manager` - Get product manager user ID for an epic (resolves from epic owner and pod mapping)

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
- **Stale Criterion Reminders**: Daily reminders
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
- **Weekly Leadership Digest**: Weekly
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
- **Method**: Google OAuth
- **Session Management**: Server-side sessions with cookies
- **Token Refresh**: Automatic token refresh
- **Logout**: `/api/auth/signout` endpoint

### Authorization (RBAC)

#### Roles
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

#### Permissions Matrix

| Action | CPO | PRODUCT_LEAD | PM | PMM/ENG/SUPPORT/SECURITY/LEARNING | PRODUCT_OPS | OTHER |
|--------|-----|--------------|----|----------------------------------|-------------|-------|
| View Portfolio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Epic Detail | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Epic | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Edit Epic | ✅ | ✅ | Owner only | ❌ | ✅ | ❌ |
| Delete Epic | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Update Criterion Status | ✅ | ✅ | Decision owner | Decision owner | ✅ | ❌ |
| Create Snapshot | ✅ | ✅ | Owner | ❌ | ✅ | ❌ |
| Manage Criteria | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Manage Settings | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Manage Users | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| View Audit Log | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

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
1. **Jira Integration**: Sync with Jira for engineering tracking
2. **Salesforce Integration**: Sync with Salesforce for GTM tracking
3. **Confluence Integration**: Link to Confluence documentation
4. **GitHub Integration**: Link to GitHub repositories
5. **Zoom Integration**: Automatic meeting transcript extraction

### AI/ML Features
1. **Predictive Risk Scoring**: ML-based risk prediction
2. **Natural Language Processing**: Extract criteria from meeting notes
3. **Sentiment Analysis**: Analyze feedback sentiment
4. **Recommendation Engine**: Suggest criteria based on epic type

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
- **Success Scorecard**: Daily snapshot of post-launch success metrics vs benchmarks
- **Retrospective**: Post-launch review at T+30, T+60, T+90 days
- **Adoption Benchmark**: Expected adoption curve by tier, feature type, and persona
- **Success Metric**: Measurable indicator of launch success (adoption, revenue, retention, etc.)

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

---

**Document Status**: Complete  
**Last Updated**: January 2026  
**Next Review**: As needed

