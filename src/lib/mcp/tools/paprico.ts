/**
 * Tools: Paprico meetings, agenda and decisions (read).
 *
 * Grouped in one file because they share a capability and are each a few lines.
 *
 * The route helpers requirePapricoReader / requirePapricoWriter cannot be reused:
 * they resolve a cookie session, which an OAuth caller does not have. Only the
 * capability name (paprico.manage) carries over -- the check is re-done here
 * against the actor's roles.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import { actorCan } from '@/lib/permissions-server';
import { computeAgendaForMeeting } from '@/lib/paprico/agendaService';

const DENIED = { error: 'You do not have permission to read Paprico.' };

export async function listPapricoMeetings(
  supabase: SupabaseClient,
  _args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  if (!(await actorCan(actor, 'paprico.manage', supabase))) return DENIED;

  const { data, error } = await supabase
    .from('paprico_meeting')
    .select('*')
    .order('meeting_date', { ascending: false });

  if (error) return { error: error.message };

  const meetings = data ?? [];
  // The next meeting is the earliest still-open one, same rule the UI uses.
  const open = meetings
    .filter((m) => m.status === 'draft' || m.status === 'agenda_published')
    .sort((a, b) => String(a.meeting_date).localeCompare(String(b.meeting_date)));

  return { meetings, nextMeetingId: open[0]?.id ?? null, count: meetings.length };
}

export const AgendaInputSchema = z.object({
  meetingId: z.string().describe('Paprico meeting UUID, from list-paprico-meetings'),
});

export async function getPapricoAgenda(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = AgendaInputSchema.safeParse(args);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!(await actorCan(actor, 'paprico.manage', supabase))) return DENIED;

  const { data: meeting, error } = await supabase
    .from('paprico_meeting')
    .select('id, meeting_date, status, chair_email, meeting_length_minutes')
    .eq('id', parsed.data.meetingId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!meeting) return { error: 'Meeting not found' };

  const agenda = await computeAgendaForMeeting(supabase, meeting);

  return { meeting, agenda };
}

export const DecisionsInputSchema = z.object({
  meetingId: z.string().optional().describe('Limit to one meeting'),
  limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
});

export async function listPapricoDecisions(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = DecisionsInputSchema.safeParse(args);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!(await actorCan(actor, 'paprico.manage', supabase))) return DENIED;

  let query = supabase
    .from('paprico_decision')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit ?? 50);

  if (parsed.data.meetingId) query = query.eq('meeting_id', parsed.data.meetingId);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return { decisions: data ?? [], count: (data ?? []).length };
}
