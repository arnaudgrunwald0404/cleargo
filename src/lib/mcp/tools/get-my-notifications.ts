/**
 * Tool: get-my-notifications
 *
 * What ClearGO has already told this person, and where.
 *
 * Without it an assistant can say what is due but not whether the user has
 * already been chased about it three times, or whether the nudge failed to
 * deliver. Both change what is worth saying: repeating a reminder someone has
 * been ignoring is noise, and a nudge that never arrived is the actual problem.
 *
 * Caller-scoped. `notification_log.user_id` is a uuid FK, so this resolves the
 * app_user row rather than matching on email.
 *
 * Note this is the delivery record, not the nudge policy. Whether an item should
 * be chased today -- overdue back-off, confirmation windows -- lives in the jobs
 * and is deliberately not modelled here.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { resolveMcpActor } from '../actor';

export const InputSchema = z.object({
  daysBack: z.number().int().min(1).max(90).optional().describe('How far back to look. Default 14.'),
  type: z
    .string()
    .optional()
    .describe('Filter to one notification type, e.g. criteria_nudge or gtm_access_nudge'),
  epicId: z.string().optional().describe('Only notifications about this epic'),
  limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
});

export async function getMyNotifications(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  auth: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const actor = await resolveMcpActor(supabase, auth);
  if (!actor) {
    return { error: `No ClearGO user profile found for ${auth.email}.` };
  }

  const since = new Date(
    Date.now() - (parsed.data.daysBack ?? 14) * 24 * 60 * 60 * 1000
  ).toISOString();

  let query = supabase
    .from('notification_log')
    .select(
      'id, type, delivery_channel, status, error, sent_at, epic_id, launch_id, criterion_id, slack_channel, slack_ts, payload'
    )
    .eq('user_id', actor.id)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(parsed.data.limit ?? 50);

  if (parsed.data.type) query = query.eq('type', parsed.data.type);
  if (parsed.data.epicId) query = query.eq('epic_id', parsed.data.epicId);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data ?? [];

  // Counting by type up front saves the model a pass, and "chased four times
  // about the same thing" is usually the point of asking.
  const byType: Record<string, number> = {};
  let failed = 0;
  for (const row of rows) {
    const t = (row.type as string) ?? 'unknown';
    byType[t] = (byType[t] ?? 0) + 1;
    if (row.status && row.status !== 'sent' && row.status !== 'delivered') failed += 1;
  }

  return {
    forEmail: auth.email,
    since,
    notifications: rows,
    count: rows.length,
    byType,
    // A nudge that did not arrive looks identical to one that was ignored,
    // unless someone says so.
    failedDeliveries: failed,
  };
}
