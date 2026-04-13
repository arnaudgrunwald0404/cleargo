# @anthropic-internal/shared

Shared skills library for **ClearGo**, **ClearMap**, **AIPulse**, and future internal tools.

Extracted from battle-tested patterns in ClearGo's production codebase.

## Modules

| Module | Import | What It Does |
|--------|--------|-------------|
| **API Client** | `@anthropic-internal/shared/api-client` | Typed HTTP client with exponential backoff retry, timeout, and error classification |
| **Rate Limiting** | `@anthropic-internal/shared/rate-limiting` | Server-side limiter + client-side fetch with coordinated retry & throttling |
| **Deduplication** | `@anthropic-internal/shared/deduplication` | Prevents duplicate in-flight requests for the same resource |
| **Auth / RBAC** | `@anthropic-internal/shared/auth` | Pluggable role-based access control engine |
| **Middleware** | `@anthropic-internal/shared/middleware` | Composable Next.js API route middleware (auth, rate-limit, CORS, errors) |
| **Notifications** | `@anthropic-internal/shared/notifications` | Multi-channel notification dispatcher (email, Slack, webhook) |
| **Database** | `@anthropic-internal/shared/db` | Supabase client factory (browser/server/admin with RLS control) |
| **Jobs** | `@anthropic-internal/shared/jobs` | Background job framework with cron secret auth and structured logging |
| **Dates** | `@anthropic-internal/shared/dates` | Timezone-safe calendar date utilities (no UTC midnight bugs) |
| **Settings** | `@anthropic-internal/shared/settings` | React contexts for feature flags and app settings with auto-save |
| **Brand** | `@anthropic-internal/shared/brand` | Design tokens, brand guidelines, color/typography validation, component presets, CSS generator |

## Quick Start

```bash
# From your app's root
npm install ../packages/shared   # or link via workspace
```

### Example: New Tool in 50 Lines

```typescript
// ---- src/lib/db.ts ----
import { createDbClients } from '@anthropic-internal/shared/db';
export const db = createDbClients({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

// ---- src/lib/auth.ts ----
import { createRbac } from '@anthropic-internal/shared/auth';
export const rbac = createRbac({
  superAdminRole: 'ADMIN',
  defaultRules: {
    'items.create': ['ADMIN', 'EDITOR'],
    'items.delete': ['ADMIN'],
    'settings.update': ['ADMIN'],
  },
});

// ---- src/app/api/items/route.ts ----
import { pipe, withRateLimit, withErrorHandler, withAuth } from '@anthropic-internal/shared/middleware';
import { createRateLimiter, RATE_LIMITS } from '@anthropic-internal/shared/rate-limiting';

const limiter = createRateLimiter();

export const GET = pipe(
  withErrorHandler(),
  withRateLimit(limiter, RATE_LIMITS.default),
  withAuth(async (req) => /* extract email from session */),
)(async (req) => {
  const items = await db.server(cookies()).from('items').select('*');
  return Response.json(items.data);
});

// ---- src/app/api/jobs/cleanup/route.ts ----
import { createJobHandler } from '@anthropic-internal/shared/jobs';
export const dynamic = 'force-dynamic';
export const GET = createJobHandler({
  name: 'cleanup',
  cronSecret: process.env.CRON_SECRET,
  handler: async (ctx) => {
    ctx.log.info('Running cleanup...');
    return { success: true, processed: 42 };
  },
});
```

## Brand Guidelines Skill

The `brand` module is a programmatic design system that enforces color, typography, and layout standards across all internal tools.

### Design Tokens (Single Source of Truth)

```typescript
import { colors, typography, spacing, layout } from '@anthropic-internal/shared/brand';

// Use tokens in your components
<div style={{ backgroundColor: colors.platinum, padding: spacing[4] }}>
  <h1 style={{ fontFamily: typography.families.display, fontSize: typography.sizes['4xl'] }}>
    Page Title
  </h1>
</div>
```

### Color Palette — "Metallurgical" Theme

| Category | Name | Hex | Usage |
|----------|------|-----|-------|
| **Primary** | White | `#FFFFFF` | Text on dark backgrounds |
| | Platinum | `#FAF8F5` | Page backgrounds |
| | Cast Iron | `#37352A` | Nav bar, dark surfaces |
| **Accent** | Copper | `#FF7A52` | Logo, CTAs, brand moments |
| | Alloy | `#FFA680` | Conditional status, highlights |
| **Secondary** | Brass | `#C3B497` | Primary UI accent, buttons |
| | Steel | `#697771` | Table headers, neutral outlines |
| | Bronze | `#6C3A2A` | Deep contrast |
| | Verdigris | `#9EB4AB` | Complementary accent |
| | Pewter | `#A1B4BA` | Light neutral |
| | White Gold | `#F4EBD7` | Light accent backgrounds |
| **Semantic** | Success | `#10B981` | Go status, confirmations |
| | Warning | `#FAB005` | Conditional status, warnings |
| | Error | `#EF4444` | No Go status, errors |
| | Info | `#228BE6` | Links, informational states |

### Typography

| Role | Font Family | Size | Weight |
|------|-------------|------|--------|
| Page Title (H1) | Marcellus (serif) | 32px | 700 |
| Section Title (H2) | Atkinson Hyperlegible | 28px | 700 |
| Card Title (H3) | Atkinson Hyperlegible | 24px | 700 |
| Subsection (H4) | Atkinson Hyperlegible | 20px | 600 |
| Body | Public Sans | 14px | 400 |
| Caption | Public Sans | 12px | 400 |
| Code | Fira Code | — | 400 |
| UI Components | Inter | — | — |

### Brand Validation

```typescript
import { validateColor, validateTypography, auditColors } from '@anthropic-internal/shared/brand';

// Validate individual colors
validateColor('#FF7A52');
// → { valid: true, name: 'copper', usage: 'Logo, primary accent, CTAs' }

validateColor('#FF0000');
// → { valid: false, suggestion: 'error (#EF4444) — No Go status, errors' }

// Audit multiple colors at once
auditColors(['#FF7A52', '#FF0000', '#C3B497']);

// Validate typography
validateTypography({ fontFamily: 'Comic Sans', fontSize: '15px', fontWeight: 450 });
// → { valid: false, issues: ['Font not approved...', 'Size not in scale...', 'Weight not approved...'] }
```

### Component Style Presets

```typescript
import { componentStyles } from '@anthropic-internal/shared/brand';

// Ready-made style objects for consistent UI
<div style={componentStyles.card}>
  <h2 style={componentStyles.sectionTitle}>Section</h2>
  <p style={componentStyles.bodyText}>Content here</p>
  <button style={componentStyles.buttonPrimary}>Save</button>
  <button style={componentStyles.buttonCopper}>Launch</button>
</div>
```

### CSS & Theme Generation

```typescript
import { generateCssVariables, generateMantineThemeConfig } from '@anthropic-internal/shared/brand';

// Generate a complete :root { ... } CSS block from tokens
const css = generateCssVariables();
fs.writeFileSync('src/app/globals.css', css);

// Generate Mantine createTheme() config
const mantineTheme = generateMantineThemeConfig();
// → { primaryColor: 'brass', colors: { brass: [...], ... }, fontFamily: '...', ... }
```

### Full Guidelines Reference

```typescript
import { brandGuidelines } from '@anthropic-internal/shared/brand';

brandGuidelines.identity;        // Company name, product name, tagline
brandGuidelines.colorRules;      // Every color with rules and don'ts
brandGuidelines.typographyRules; // Font families, hierarchy, rules
brandGuidelines.layoutRules;     // Page, spacing, cards, buttons, tables, nav, shadows, radii, breakpoints, z-index
brandGuidelines.statusBadges;    // Go/NoGo/Conditional/Open/Draft/etc.
```

## Architecture Decisions

### Why factory functions, not classes?
Composability. Factory functions return plain objects that tree-shake cleanly
and don't require `new`. They also avoid `this` binding issues in serverless.

### Why peer dependencies for Next.js, React, Supabase?
Each app pins its own framework version. The shared library adapts to whatever
version the host app provides, avoiding dependency conflicts.

### Why dynamic requires in the DB module?
Supabase is an optional peer dep. Apps that don't use Supabase (e.g. a CLI tool)
don't need to install it. The dynamic `require()` ensures no build-time errors.

### Why `createRateLimiter()` returns a new instance?
Each API route or middleware can have its own limiter with different configs.
For global rate limiting (like ClearGo's proxy.ts), create one instance and
share it across routes.

## Migrating ClearGo

| ClearGo File | Shared Replacement |
|---|---|
| `src/lib/rate-limit.ts` | `createRateLimiter()` |
| `src/lib/fetch-with-rate-limit.ts` | `createRateLimitedFetch()` |
| `src/lib/request-deduplication.ts` | `createResponseDeduplicator()` |
| `src/lib/permissions.ts` | `createRbac()` with ClearGo's capability IDs |
| `src/lib/middleware/rate-limit-middleware.ts` | `withRateLimit()` + `pipe()` |
| `src/lib/api-auth.ts` | `withAuth()` |
| `src/lib/date-utils.ts` | All date functions from `dates` module |
| `src/lib/supabase/server.ts` | `createDbClients()` |
| `src/lib/supabase/client.ts` | `createDbClients().browser()` |
| `src/contexts/FeatureFlagsContext.tsx` | `FeatureFlagsProvider` |
| `src/app/api/jobs/*/route.ts` | `createJobHandler()` |
| `src/lib/email/notifications.ts` | `createNotificationDispatcher()` |
| `src/lib/slack/notifications.ts` | `createSlackChannel()` |
| `src/lib/mantine-theme.ts` | `generateMantineThemeConfig()` |
| `src/app/globals.css` (`:root` block) | `generateCssVariables()` |
| `docs/COLOR_PALETTE.md` | `brandGuidelines.colorRules` |

## Development

```bash
cd packages/shared
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm run test     # Run tests
npm run clean    # Remove dist/
```
