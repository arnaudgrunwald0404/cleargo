/**
 * Tool: get-pending-gtm-access
 *
 * Epics whose GTM access confirmation is still outstanding for the caller.
 *
 * A separate queue from get-my-work: that one is per-criterion, this is
 * per-epic, and getMyWork does not include it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { getGtmAccessPendingEpics } from '@/lib/services/gtmAccessNudgeService';

export async function getPendingGtmAccess(
  supabase: SupabaseClient,
  _args: Record<string, unknown>,
  auth: McpAuthInfo
): Promise<unknown> {
  const epics = await getGtmAccessPendingEpics(supabase, { ownerEmail: auth.email });

  return {
    forEmail: auth.email,
    epics,
    count: epics.length,
  };
}
