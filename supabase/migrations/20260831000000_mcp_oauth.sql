-- 2026-09-03: made replayable. Production already had these three tables --
-- applied out-of-band, without a schema_migrations row -- so a `db push` that
-- reached this file died on `relation "mcp_oauth_client" already exists` with
-- its 24 predecessors already applied.
--
-- IF NOT EXISTS on the tables and indexes is enough to make the whole file safe
-- to replay: every other statement here is already idempotent (COMMENT ON,
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY, CREATE OR REPLACE FUNCTION), and
-- there are no policies to collide.
--
-- Editing it is inert on any database that already recorded this version; the
-- CLI matches on version, not on the statements it stored.

-- OAuth 2.1 authorization server state for the remote MCP connector.
--
-- The MCP server at /api/mcp becomes an OAuth resource server so a teammate can
-- add it in Claude Desktop with nothing but a URL. Everything that flow needs to
-- remember lives here:
--
--   mcp_oauth_client              -- clients that registered themselves (RFC 7591)
--   mcp_oauth_authorization_code  -- codes in flight, single-use, PKCE-bound
--   mcp_oauth_token               -- refresh tokens, hashed, per user, revocable
--
-- Access tokens are deliberately NOT stored. They are short-lived signed JWTs
-- (see src/lib/oauth/tokens.ts) so the hot path -- every MCP tool call -- costs a
-- signature check and no database round trip. The trade is that an access token
-- cannot be revoked before it expires; the TTL is kept to an hour for that
-- reason, and revoking the refresh token stops the renewal.
--
-- All three tables are reached only through the service-role client from route
-- handlers. RLS is enabled with no policies, which denies anon and authenticated
-- outright -- there is no legitimate direct-from-browser read of any of this.

-- ── Registered clients ──────────────────────────────────────────────────────
--
-- Dynamic client registration is what removes the manual setup: Claude Desktop
-- POSTs its own metadata and gets a client_id back, so no teammate ever pastes a
-- client ID or secret. Every row is therefore self-registered and untrusted --
-- redirect_uris is the only field with security weight, and the authorize
-- endpoint matches against it exactly.
CREATE TABLE IF NOT EXISTS public.mcp_oauth_client (
    client_id         TEXT PRIMARY KEY,
    client_name       TEXT,
    redirect_uris     TEXT[] NOT NULL CHECK (array_length(redirect_uris, 1) > 0),
    grant_types       TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
    response_types    TEXT[] NOT NULL DEFAULT ARRAY['code'],
    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
    scope             TEXT,
    client_uri        TEXT,
    logo_uri          TEXT,
    -- Whole registration request, kept verbatim. Useful when a client turns out
    -- to send something the columns above do not model.
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mcp_oauth_client IS
    'Self-registered OAuth clients (RFC 7591) for the MCP connector. Rows are created by unauthenticated callers; treat every field as untrusted input.';

-- ── Authorization codes ─────────────────────────────────────────────────────
--
-- Short-lived and single-use. consumed_at rather than DELETE, because replay is
-- worth detecting: a second presentation of a spent code means either a broken
-- client or a stolen one, and a deleted row cannot tell those apart from a code
-- that never existed.
CREATE TABLE IF NOT EXISTS public.mcp_oauth_authorization_code (
    code                  TEXT PRIMARY KEY,
    client_id             TEXT NOT NULL REFERENCES public.mcp_oauth_client(client_id) ON DELETE CASCADE,
    user_email            TEXT NOT NULL,
    redirect_uri          TEXT NOT NULL,
    scope                 TEXT NOT NULL DEFAULT '',
    -- PKCE is mandatory here; S256 only. The authorize endpoint rejects a
    -- missing or 'plain' challenge rather than storing it.
    code_challenge        TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
    -- RFC 8707. Recorded so the token endpoint can bind the access token's
    -- audience to the resource the client actually asked for.
    resource              TEXT,
    expires_at            TIMESTAMPTZ NOT NULL,
    consumed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_code_expires ON public.mcp_oauth_authorization_code (expires_at);

COMMENT ON COLUMN public.mcp_oauth_authorization_code.consumed_at IS
    'Set on first exchange. A second exchange of the same code is a replay: reject it AND revoke the tokens already issued from it.';

-- ── Refresh tokens ──────────────────────────────────────────────────────────
--
-- Stored as a SHA-256 hash, never in the clear: a database dump should not hand
-- anyone a working credential. Rotating -- each refresh issues a new row and
-- revokes the old one -- so a leaked refresh token has a short useful life and
-- its reuse is detectable.
CREATE TABLE IF NOT EXISTS public.mcp_oauth_token (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash     TEXT NOT NULL UNIQUE,
    client_id      TEXT NOT NULL REFERENCES public.mcp_oauth_client(client_id) ON DELETE CASCADE,
    user_email     TEXT NOT NULL,
    scope          TEXT NOT NULL DEFAULT '',
    resource       TEXT,
    -- Set when rotated or explicitly revoked. Rows are kept rather than deleted
    -- so a revocation screen can show a user what was connected and when.
    revoked_at     TIMESTAMPTZ,
    expires_at     TIMESTAMPTZ NOT NULL,
    last_used_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_token_user ON public.mcp_oauth_token (user_email) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_token_expires ON public.mcp_oauth_token (expires_at);

COMMENT ON TABLE public.mcp_oauth_token IS
    'Hashed, rotating refresh tokens for the MCP connector. Access tokens are stateless JWTs and are not stored here.';

-- ── Lockdown ────────────────────────────────────────────────────────────────
--
-- RLS on with zero policies = no access for anon or authenticated. Only the
-- service-role client used by the OAuth route handlers can read or write.
ALTER TABLE public.mcp_oauth_client ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_authorization_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_token ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mcp_oauth_client FROM anon, authenticated;
REVOKE ALL ON public.mcp_oauth_authorization_code FROM anon, authenticated;
REVOKE ALL ON public.mcp_oauth_token FROM anon, authenticated;

-- ── Housekeeping ────────────────────────────────────────────────────────────
--
-- Expired codes and tokens accumulate forever otherwise. Called opportunistically
-- from the token endpoint rather than on a cron: the volume is tiny, and tying it
-- to the only route that creates these rows keeps it from becoming another job to
-- monitor.
CREATE OR REPLACE FUNCTION public.prune_mcp_oauth_expired()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.mcp_oauth_authorization_code
     WHERE expires_at < now() - INTERVAL '1 day';

    DELETE FROM public.mcp_oauth_token
     WHERE expires_at < now() - INTERVAL '30 days';
$$;
