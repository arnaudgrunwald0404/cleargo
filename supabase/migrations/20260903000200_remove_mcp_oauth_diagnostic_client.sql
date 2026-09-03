-- Remove the diagnostic OAuth client created while debugging the Claude Desktop
-- connector.
--
-- The connector showed the consent screen, then "Couldn't connect", then listed
-- itself as having no tools. All three mcp_oauth_* tables existed and were
-- EMPTY, which was the answer: /api/oauth/authorize validates client_id via
-- getClient(), so consent could only have rendered while a client row existed,
-- and prune_mcp_oauth_expired never deletes clients. Claude was holding a
-- client_id the database did not have, so the remedy was to disconnect and
-- re-add, which re-runs dynamic registration.
--
-- Proving registration still worked meant POSTing to /api/oauth/register
-- against production, which returned 201 and left a real client row behind.
-- This deletes it. Not a client anyone uses.
--
-- Idempotent, and a no-op in every environment that never saw the probe.

DELETE FROM public.mcp_oauth_client
WHERE client_id = 'mcp_fa721104cd8e729709325f6829279865';
