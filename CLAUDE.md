# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev              # Start dev server (Turbopack)
npm run dev:webpack      # Start dev server (Webpack fallback)
npm run build            # Production build (custom netlify-build.js)
npm start                # Production server
npm run lint             # ESLint
npm test                 # Jest unit tests
npm test -- --testPathPattern="path/to/test"  # Run a single test file
npm run test:watch       # Jest watch mode
npm run test:coverage    # Coverage report
npm run check-prd        # Check if PRD needs updating after feature changes
```

E2E tests use Playwright: `npx playwright test`

## Tech Stack

- **Framework:** Next.js 16 (App Router) on Netlify
- **Language:** TypeScript (strict mode), path alias `@/*` → `./src/*`
- **UI:** Mantine 8 + Tailwind CSS 4 + Tabler Icons
- **Database:** Supabase (PostgreSQL) with direct query builder (no ORM), heavy RLS
- **Auth:** Supabase Auth (Google OAuth + email) with custom magic link fallback
- **AI:** Vercel AI SDK v6 with Google Gemini 1.5 Pro
- **Email:** Resend
- **Testing:** Jest (jsdom) + Playwright

## Architecture

### App Structure (`src/app/`)

Next.js App Router with route groups:
- `(dashboard)/` — Main dashboard layout group
- `(settings)/` — Settings pages layout group
- `admin/` — Admin panel
- `auth/` — Login, logout, OAuth callbacks
- `epics/` — Epic detail pages (note: "epic" was renamed from "launch" in migration 0018)
- `api/` — 40+ API route handlers organized by domain

### Core Business Logic (`src/lib/`)

- `readiness.ts`, `readiness-scoring.ts` — Readiness score calculation (0-100%, GO/CONDITIONAL/NO_GO)
- `epics.ts` — Epic lifecycle management
- `permissions.ts` — RBAC: SUPERADMIN, WORKSPACE_ADMIN, POD_LEAD, PRODUCT_MANAGER, PMM, OTHER
- `aha/` — Aha! bidirectional sync (discover, field mapping, write-back)
- `slack/` — Slack bot notifications, daily nudges, weekly digests
- `ai/` — Gemini-powered smart nudges and criterion pruning
- `success/` — HEART metrics framework (Happiness, Engagement, Adoption, Retention, Task Success)
- `auth/` — Session management, magic link tokens
- `supabase/` — Supabase client creation (browser + server variants)
- `integrations/` — Pendo, Snowflake connectors

### Database (`supabase/migrations/`)

140+ migrations. Key tables: `epic`, `criterion`, `epic_criterion_status`, `app_user`, `product`, `heart_metrics`, `meeting`, `epic_comment`. Row-Level Security is extensively used.

### Contexts (`src/contexts/`)

- `FeatureFlagsContext` — Feature flag management
- `SettingsContext` — Global app settings

### Netlify Background Functions (`netlify/functions/`)

Long-running tasks (up to 15min) like HEART metric setup.

## Key Patterns

- Supabase clients: use `createClient()` from `@/lib/supabase/server` in server components/API routes, `@/lib/supabase/client` in client components
- API routes return NextResponse JSON; auth is checked via Supabase session or magic link cookie (`lr_session`)
- Admin impersonation uses a separate cookie; check `IMPERSONATE_COOKIE_NAME`
- Integration webhooks (Aha!, Slack, Jira) validate signatures before processing

## PRD Update Rule

When committing changes that affect features, schema, API endpoints, integrations, auth, or user flows, update `docs/PRD-Retroactive.md`. A pre-commit hook checks this. Bug fixes, styling tweaks, and test changes are exempt. Use `npm run check-prd` to verify.

## Commit Message Convention

Feature commits: `feat: description`
PRD updates: `docs: update PRD for [feature name]`
Bug fixes: `fix: description`
