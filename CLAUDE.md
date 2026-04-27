# CLAUDE.md — ClearGO

## Project Overview

ClearGO is a **Launch Readiness Console** — a full-stack SaaS application for managing product launches. It tracks release readiness criteria, go/no-go decisions, post-launch success metrics (HEART framework), and team coordination via integrations with Aha!, Slack, Jira, Google Calendar, Pendo, and Rovo.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + RLS) · Mantine UI · Tailwind CSS · Deployed on Netlify

## Quick Reference

```bash
npm run dev              # Start dev server (Turbopack)
npm run dev:webpack      # Start dev server (Webpack)
npm run build            # Production build (Netlify)
npm run lint             # ESLint
npm run test             # Jest tests
npm run test:watch       # Jest in watch mode
npm run test:coverage    # Jest with coverage
npm run check-prd        # Check if PRD needs updating
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── api/                # REST API endpoints
│   │   ├── epics/          # Epic (launch) CRUD
│   │   ├── criteria/       # Readiness criteria
│   │   ├── integrations/   # Aha!, Slack, Jira, Google Calendar, Pendo
│   │   ├── jobs/           # Cron-triggered background jobs
│   │   ├── auth/           # Authentication endpoints
│   │   ├── settings/       # App configuration
│   │   └── dashboard/      # Dashboard metrics
│   ├── (dashboard)/        # Dashboard pages (authenticated)
│   ├── (settings)/         # Settings pages
│   ├── admin/              # Admin panel
│   ├── epics/              # Epic detail pages
│   ├── portfolio/          # Portfolio view
│   └── auth/               # Login, callback, signout
├── components/             # React components (PascalCase files)
│   ├── epic/               # Epic-specific components
│   ├── admin/              # Admin UI
│   ├── dashboard/          # Dashboard widgets
│   └── analytics/          # Analytics visualizations
├── contexts/               # React Contexts (FeatureFlags, Settings)
├── lib/                    # Utilities and business logic
│   ├── supabase/           # Supabase client (server.ts, middleware.ts)
│   ├── auth/               # Auth utilities (getUser, requireRole, roles)
│   ├── aha/                # Aha! integration (client, webhooks, mapping)
│   ├── slack/              # Slack integration (client, templates, notifications)
│   ├── email/              # Email via Resend
│   ├── jira/               # Jira integration
│   ├── rovo/               # Rovo MCP client
│   ├── integrations/       # Pendo, Snowflake clients
│   ├── heart/              # HEART metrics framework
│   ├── services/           # Business logic services
│   ├── middleware/          # Rate limiting middleware
│   ├── __tests__/          # Unit tests
│   └── __mocks__/          # Test mocks
├── types/                  # TypeScript type definitions
└── proxy.ts                # Request deduplication

supabase/migrations/        # 155+ PostgreSQL migration files
.github/workflows/          # GitHub Actions (cron jobs)
config/                     # Slack app manifest
docs/                       # PRD, API docs, color palette
scripts/                    # Build & utility scripts
e2e/                        # Playwright E2E tests
```

## Architecture

### Authentication & Authorization

- Custom auth using JWT stored in `lr_session` cookie
- Session verification via `jose` library (`src/lib/jwt.ts`)
- Role-based access control with roles: `SUPERADMIN`, `PRODUCT_OPS`, `CPO`, `PM`, `PMM`, `PRODUCT`, `ENG`, `OTHER`
- Auth helpers: `getAuthenticatedUserEmail()` for API routes, `requireAuth()` for enforcing auth
- Admin operations use Supabase service role key to bypass RLS
- Impersonation support for admin users

### Database

- **Supabase** (PostgreSQL) with Row-Level Security (RLS) enforced
- Two client types: regular (respects RLS) and admin (service role, bypasses RLS)
- Query via Supabase query builder — no raw SQL
- Custom fetch wrapper with 30s timeout on server client
- Key tables: `epic`, `product`, `criterion`, `epic_criterion_status`, `app_user`, `app_settings`

### API Routes

All API routes follow this pattern:
- Export `force-dynamic` for dynamic rendering
- Use `NextRequest`/`NextResponse`
- Auth check via `getAuthenticatedUserEmail()` or `requireAuth()`
- Rate limiting via `withRateLimit(handler, config)` wrapper
- Return JSON with appropriate HTTP status codes

### External Integrations

| Integration | Purpose | Key Files |
|---|---|---|
| **Aha!** | Epic sync, webhook events, readiness writeback | `src/lib/aha/` |
| **Slack** | Notifications, retro reminders, scorecard alerts | `src/lib/slack/` |
| **Jira** | Issue tracking, epic key extraction | `src/lib/jira/` |
| **Google Calendar** | Meeting sync | `src/app/api/integrations/google-calendar/` |
| **Pendo** | Product analytics, HEART metrics | `src/lib/integrations/` |
| **Rovo** | MCP protocol integration | `src/lib/rovo/` |
| **Resend** | Email notifications | `src/lib/email/` |

All external API clients use **exponential backoff retry logic** (typically 3 retries).

### Background Jobs

Triggered via GitHub Actions cron → HTTP POST to `/api/jobs/*` endpoints, authenticated with `CRON_SECRET`.

## Code Conventions

### General

- **TypeScript strict mode** — all code must be type-safe
- **Path alias:** `@/*` maps to `./src/*`
- **Zod** for runtime validation at API boundaries
- **No raw SQL** — use Supabase query builder

### File Naming

- **Utilities/libs:** camelCase (`readiness.ts`, `rate-limit.ts`)
- **React components:** PascalCase (`EpicCard.tsx`, `HomeDashboard.tsx`)
- **Types:** PascalCase for interfaces/types, UPPER_SNAKE_CASE for constants
- **Database:** snake_case for table/column names

### React Components

- Use `'use client'` directive for interactive components
- Mantine UI components for consistent design system
- Tailwind CSS for custom styling
- Props defined via TypeScript interfaces

### Error Handling

- Try-catch with `console.error` logging
- API routes return `NextResponse.json({ error: '...' }, { status: CODE })`
- External API calls wrapped in retry logic with exponential backoff

### Permissions

- Capability-based system defined in `src/lib/permissions.ts`
- Default rules per role in `src/lib/roles.ts`
- Check permissions before performing sensitive operations

## Testing

- **Framework:** Jest 30 with ts-jest, jsdom environment
- **Component tests:** @testing-library/react
- **E2E tests:** Playwright (`e2e/` directory)
- **Test location:** `__tests__/` directories alongside source code
- **Mocks:** `src/lib/__mocks__/` for auth, JWT, Supabase client
- **Pattern:** Mock Supabase client with chained query builder API

## Environment Variables

### Required

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (fallback: `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key for RLS bypass (fallback: `SUPABASE_SECRET_KEY`) |
| `CRON_SECRET` | Auth for cron job endpoints |

### Integrations (optional per feature)

`AHA_DOMAIN`, `AHA_API_TOKEN`, `AHA_ROADMAP_PIVOT_ID` (custom pivot ID for weekly Roadmap Snapshot cron — bookmarks/custom_pivots), `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `RESEND_API_KEY`, `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `PENDO_INTEGRATION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ROVO_API_KEY`

## Deployment

- **Platform:** Netlify with `@netlify/plugin-nextjs`
- **Build:** `node scripts/netlify-build.js` (clears cache, runs `next build`)
- **Edge middleware disabled:** `NEXT_DISABLE_NETLIFY_EDGE=true`
- **Cron jobs:** GitHub Actions workflows (`.github/workflows/`) calling `/api/jobs/*`

## PRD Maintenance

When making changes that affect features, functionality, integrations, or data models, update `docs/PRD-Retroactive.md`. See `.cursorrules` for detailed rules on when to update. A pre-commit hook checks this automatically — bypass with `git commit --no-verify` when appropriate, but follow up with a PRD update commit.

## Commit Message Convention

```
feat: add [feature]
fix: resolve [issue]
docs: update PRD for [feature]
refactor: [description]
test: add tests for [feature]
```
