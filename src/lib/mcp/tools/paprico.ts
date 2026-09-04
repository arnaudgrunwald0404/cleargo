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
import { findNextCalendarEvent } from '@/lib/google/calendar';
import { publishMeetingAgenda } from '@/lib/paprico/publishAgenda';

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


export const ItemsInputSchema = z.object({
  status: z
    .string()
    .optional()
    .describe('Filter by item status, e.g. proposed, scheduled, decided, deferred'),
  limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
});

export async function listPapricoItems(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = ItemsInputSchema.safeParse(args);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!(await actorCan(actor, 'paprico.manage', supabase))) return DENIED;

  let query = supabase
    .from('paprico_item')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit ?? 50);

  if (parsed.data.status) query = query.eq('status', parsed.data.status);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return { items: data ?? [], count: (data ?? []).length };
}

/**
 * The calendar lookup behind the New Meeting form's "Next on your calendar"
 * hint. Degrades to found:false the same way the route does -- no Google
 * connection, a connection predating the calendar.readonly scope, or the
 * Calendar API switched off are all config problems, not failures worth
 * erroring a conversation over.
 */
export const NextMeetingInputSchema = z.object({
  query: z.string().optional().describe('Title substring to match. Default "PaPriCo".'),
});

export async function getNextPapricoMeeting(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = NextMeetingInputSchema.safeParse(args);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!(await actorCan(actor, 'paprico.manage', supabase))) return DENIED;

  try {
    const { connected, event } = await findNextCalendarEvent(parsed.data.query?.trim() || 'PaPriCo');
    if (!connected) return { found: false, reason: 'google_not_connected' };
    if (!event) return { found: false, reason: 'no_matching_event' };
    return { found: true, event };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[mcp] PaPriCo calendar lookup failed:', message);
    return {
      found: false,
      reason: message.includes(' 403 ') ? 'calendar_access_denied' : 'lookup_failed',
    };
  }
}

export const CreateMeetingInputSchema = z.object({
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
  chairEmail: z.string().email().nullish().describe('Defaults to the caller'),
  meetingLengthMinutes: z.number().int().min(15).max(480).optional().describe('Default 60'),
  notes: z.string().max(20000).nullish(),
});

export async function createPapricoMeeting(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = CreateMeetingInputSchema.safeParse(args);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!(await actorCan(actor, 'paprico.manage', supabase))) {
    return { error: 'You do not have permission to manage PaPriCo.' };
  }

  const { data, error } = await supabase
    .from('paprico_meeting')
    .insert({
      meeting_date: parsed.data.meetingDate,
      chair_email: parsed.data.chairEmail ?? actor.email,
      meeting_length_minutes: parsed.data.meetingLengthMinutes ?? 60,
      notes: parsed.data.notes ?? null,
      created_by: actor.email,
    })
    .select('*')
    .single();

  if (error) return { error: error.message };

  return {
    success: true,
    message: `PaPriCo meeting created for ${parsed.data.meetingDate}. It starts as a draft; publish the agenda when it is ready.`,
    meeting: data,
  };
}

export const AddItemInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(20000).nullish(),
  category: z.string().max(100).nullish(),
  ownerEmail: z.string().email().nullish(),
  timeBoxMinutes: z.number().int().min(1).max(480).nullish(),
});

export async function addPapricoItem(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = AddItemInputSchema.safeParse(args);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!(await actorCan(actor, 'paprico.manage', supabase))) {
    return { error: 'You do not have permission to manage PaPriCo.' };
  }

  const { data, error } = await supabase
    .from('paprico_item')
    .insert({
      source: 'standing',
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      owner_email: parsed.data.ownerEmail ?? null,
      time_box_minutes: parsed.data.timeBoxMinutes ?? null,
      status: 'proposed',
      created_by: actor.email,
    })
    .select('*')
    .single();

  if (error) return { error: error.message };

  return { success: true, message: `Added "${parsed.data.title}" to the PaPriCo backlog.`, item: data };
}


export const PublishInputSchema = z.object({
  meetingId: z.string().describe('Paprico meeting UUID, from list-paprico-meetings'),
});

export async function publishPapricoAgenda(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = PublishInputSchema.safeParse(args);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!(await actorCan(actor, 'paprico.manage', supabase))) {
    return { error: 'You do not have permission to manage PaPriCo.' };
  }

  const result = await publishMeetingAgenda(supabase, parsed.data.meetingId);

  if (result.outcome !== 'published') {
    return { error: result.reason };
  }

  return {
    success: true,
    message:
      'Agenda published and frozen onto the meeting. The Slack block below is what gets posted to #paprico.',
    meeting: result.meeting,
    agenda: result.agenda,
    slackBlock: result.slackBlock,
  };
}
