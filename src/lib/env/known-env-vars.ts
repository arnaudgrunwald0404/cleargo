/**
 * Every environment variable this application reads.
 *
 * The point is not documentation -- it is the reference set for
 * findEnvNameNearMisses(), which warns at startup when a variable is set under a
 * name one token away from a real one. A misspelled key is otherwise completely
 * silent: the feature simply behaves as though it were never configured.
 *
 * KEEP IN SYNC. `__tests__/known-env-vars.test.ts` scans src/ and netlify/ for
 * `process.env.X` and fails when something is read but not listed here, so this
 * cannot drift without CI saying so. Extra entries that no code reads are
 * harmless -- they only make the near-miss check quieter.
 *
 * Four of the GOOGLE_TEMPLATE_* names are reached through
 * `process.env[def.templateEnvVar]` and are invisible to that scan, so the test
 * also collects the `templateEnvVar` literals in the artifact registry.
 */

/**
 * A newline-separated block rather than one quoted literal per name, purely
 * because it is easier to read and to regenerate.
 *
 * Note for anyone who sees a secret-scanner alert on this file: it holds NAMES
 * ONLY, never values. GitGuardian's "Username Password" detector has flagged it
 * before, on the adjacency of SNOWFLAKE_PASSWORD and SNOWFLAKE_USERNAME (PR #49,
 * incident 36747789) -- a false positive, triaged as such. Reformatting does not
 * help, because the scan covers every commit in a pull request rather than its
 * head state, so a finding pinned to an earlier commit survives any later fix.
 * Triage it in GitGuardian instead of reshaping this file to dodge a detector.
 */
const NAMES = `
AHA_API_TOKEN
AHA_DOMAIN
AHA_IDEAS_PORTAL_JWT_CALLBACK_URL
AHA_IDEAS_PORTAL_JWT_SECRET
AHA_IDEAS_WIDGET_ID
AHA_IDEAS_WIDGET_JWT_SECRET
AHA_ROADMAP_PIVOT_ID
AHA_WEBHOOK_SECRET
ALLOWED_EMAIL_DOMAIN
ALLOWLIST_DOMAINS
ANTHROPIC_API_KEY
ANTHROPIC_BASE_URL
ATLASSIAN_OAUTH_CLIENT_ID
ATLASSIAN_OAUTH_CLIENT_SECRET
CLAUDE_API_KEY
CLEARGO_AI_API_KEY
CLEARGO_ANTHROPIC_BASE_URL
CLEARGO_APP_URL
CLEARMAP_JWT
CLEARMAP_SUPABASE_ANON_KEY
COMPANY_TIMEZONE
CRON_SECRET
DEBUG_AHA_PIVOT
DIGEST_SCHEDULE
DIGEST_VALIDATOR_EMAIL
EMAIL_SENDER
EXTRA_NOTIFICATION_HOLIDAYS
FALLBACK_PRODUCT_OPS_EMAIL
FALLBACK_USER_EMAIL
GEMINI_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
GOOGLE_IMPERSONATE_SUBJECT
GOOGLE_LAUNCH_DRIVE_FOLDER_ID
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
GOOGLE_TEMPLATE_ENABLEMENT_GUIDE_ID
GOOGLE_TEMPLATE_GATE_CHECKLIST_ID
GOOGLE_TEMPLATE_MARKETING_BRIEF_ID
GOOGLE_TEMPLATE_MESSAGING_BRIEF_ID
GOOGLE_TEMPLATE_STORY_BRIEF_ID
HEART_DASHBOARD_SNAPSHOT_ONLY
INVITE_DELAY_MS
MAGIC_LINK_SECRET
MCP_ACTOR_EMAIL
MCP_SECRET
NETLIFY
NETLIFY_ARTIFACT_DRAFT_SECRET
NETLIFY_HEART_SETUP_SECRET
NETLIFY_URL
NEXT_PUBLIC_AHA_DOMAIN
NEXT_PUBLIC_AHA_IDEAS_PORTAL_URL
NEXT_PUBLIC_AHA_IDEAS_WIDGET_ACCOUNT
NEXT_PUBLIC_AHA_IDEAS_WIDGET_APPLICATION_ID
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_FEATURE_FLAGS
NEXT_PUBLIC_MARKETING_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_RUNTIME
NGROK_URL
NODE_ENV
NOTIFICATIONS_IGNORE_BUSINESS_CALENDAR
OPENAI_API_KEY
RESEND_API_KEY
ROVO_OAUTH_CLIENT_ID
ROVO_OAUTH_CLIENT_SECRET
SLACK_BOT_TOKEN
SLACK_DEFAULT_CHANNEL
SLACK_FORBIDDEN_CHANNELS
SLACK_SIGNING_SECRET
SNOWFLAKE_ACCOUNT
SNOWFLAKE_DATABASE
SNOWFLAKE_PASSWORD
SNOWFLAKE_SCHEMA
SNOWFLAKE_USERNAME
SNOWFLAKE_WAREHOUSE
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPERADMIN_EMAIL
URL
`;

export const KNOWN_ENV_VARS: readonly string[] = NAMES.trim().split(/\s+/);
