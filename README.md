# ClearGO - Launch Readiness Console

A launch readiness management system for tracking epics, criteria, and go/no-go decisions. Integrates with Aha! for epic synchronization.

## Prerequisites

- Node.js 18+
- npm
- Supabase account (for database and authentication)
- Aha! account (optional, for epic sync)

## Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Aha! Integration (optional)
AHA_API_KEY=your-aha-api-key
AHA_ACCOUNT_DOMAIN=your-account.aha.io
AHA_WEBHOOK_SECRET=your-webhook-secret

# Email (Resend)
RESEND_API_KEY=your-resend-api-key
```

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run test` | Run tests |

## Database Migrations

Migrations are in `supabase/migrations/`. To apply:

1. **Via Supabase Dashboard**: Copy SQL from migration files into the SQL Editor
2. **Via Supabase CLI**: `npx supabase db push` (requires linking project first)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # API endpoints
│   ├── admin/             # Admin pages (settings, criteria, audit)
│   ├── epics/             # Epic management pages
│   └── ...
├── components/            # React components
├── lib/                   # Utilities, services, and business logic
│   ├── aha/              # Aha! integration
│   ├── db/               # Database queries
│   ├── email/            # Email notifications
│   ├── slack/            # Slack integration
│   └── supabase/         # Supabase client setup
└── types/                # TypeScript type definitions
```

## Key Features

- **Epic Management**: Track launch epics with tier classification and readiness scoring
- **Criteria Matrix**: Configurable go/no-go criteria with category grouping
- **Aha! Sync**: Automatic sync of epics from Aha! via webhooks
- **Role-Based Access**: Granular permissions for different user roles
- **Email Notifications**: Customizable email templates for invites and reminders
- **Activity Feed**: Track changes and updates across the system

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: Mantine UI + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Email**: Resend
- **Testing**: Jest + React Testing Library

## Contributing

1. Create a feature branch from `main`
2. Make changes and ensure `npm run lint` passes
3. Format code with `npm run format`
4. Submit a pull request
