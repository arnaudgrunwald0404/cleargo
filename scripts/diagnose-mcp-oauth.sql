-- How far did the Claude Desktop connector actually get?
--
-- Observed: the consent screen renders correctly with the right email, then
-- Claude shows "Couldn't connect", and the connector appears in the list saying
-- "This connector has no tools available."
--
-- Already ruled out from the outside, against production:
--   * /.well-known/oauth-authorization-server            200, all endpoints present
--   * /.well-known/oauth-protected-resource/api/mcp      200, resource + scopes correct
--   * POST /api/mcp unauthenticated                      401 with the right challenge
--   * POST /api/oauth/token with a bogus code            clean 400 invalid_grant,
--                                                        so mcp_oauth_authorization_code
--                                                        exists and is queryable
--   * MAGIC_LINK_SECRET (signs the tokens) is set, since magic-link login works
--   * the allowlist cannot be the cause: it falls back to clearcompany.com
--
-- These three tables record each step, so they say which one failed.
-- All read-only.

-- ---------------------------------------------------------------------------
-- A. Do all three tables exist?
--
-- The migration 20260831000000_mcp_oauth.sql must be applied to PRODUCTION
-- manually. Only mcp_oauth_authorization_code has been proven to exist (by the
-- clean invalid_grant above). If mcp_oauth_token is missing, issuing the token
-- throws AFTER the code is consumed -- which looks exactly like this.
-- ---------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'mcp_oauth%'
ORDER BY table_name;
-- Expect three rows: _authorization_code, _client, _token.


-- ---------------------------------------------------------------------------
-- B. Did Claude register as a client? (dynamic client registration)
-- ---------------------------------------------------------------------------
SELECT
    client_id,
    client_name,
    redirect_uris,
    created_at
FROM public.mcp_oauth_client
ORDER BY created_at DESC
LIMIT 10;
-- No rows  -> registration failed; the flow never really started.
-- Rows     -> registration worked. Note the redirect_uris: the token endpoint
--             requires the redirect_uri to match the authorize request byte for
--             byte, so a trailing-slash difference here is worth a look.


-- ---------------------------------------------------------------------------
-- C. THE DECIDING QUESTION -- was a token ever issued?
--
-- A refresh token row means the code exchange SUCCEEDED, so OAuth is fine and
-- the problem is downstream in tools/list. No row means the exchange failed and
-- "no tools available" is just the symptom.
-- ---------------------------------------------------------------------------
SELECT
    client_id,
    user_email,
    scope,
    resource,
    created_at,
    expires_at,
    revoked_at
FROM public.mcp_oauth_token
ORDER BY created_at DESC
LIMIT 10;
-- Pay attention to `resource`. It is what the access token's `aud` claim is set
-- to, and /api/mcp refuses any token whose aud is not exactly
-- https://cleargo.netlify.app/api/mcp. A different value here -- a trailing
-- slash, a bare origin, or a preview-deploy hostname -- means every tool call
-- 401s while the connector still looks connected.


-- ---------------------------------------------------------------------------
-- D. Any authorization codes left unspent?
--
-- A code is deleted when redeemed. Rows here that are not expired mean consent
-- completed but the exchange never happened -- pointing at the redirect back to
-- Claude rather than at the token endpoint.
-- ---------------------------------------------------------------------------
SELECT
    client_id,
    user_email,
    redirect_uri,
    resource,
    created_at,
    expires_at,
    expires_at < now() AS expired
FROM public.mcp_oauth_authorization_code
ORDER BY created_at DESC
LIMIT 10;


-- ---------------------------------------------------------------------------
-- E. CLEANUP -- now a migration.
--
-- Proving registration still worked meant POSTing to /api/oauth/register
-- against production, which returned 201 and left a real client row behind.
-- Deleting it is:
--   supabase/migrations/20260903000200_remove_mcp_oauth_diagnostic_client.sql
-- ---------------------------------------------------------------------------
