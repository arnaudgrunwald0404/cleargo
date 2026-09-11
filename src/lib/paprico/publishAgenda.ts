/**
 * Publishing a PaPriCo agenda.
 *
 * Three things happen together: the agenda is computed, snapshotted onto the
 * meeting, and the meeting moves draft -> agenda_published. The snapshot is the
 * point -- once published, the agenda is what was circulated, not whatever the
 * backlog looks like when someone opens it later.
 *
 * The update is conditioned on status still being 'draft', so two people
 * publishing at once produces one publish and one clear refusal rather than two
 * snapshots racing.
 *
 * Extracted so the HTTP route and the MCP tool share it. Outcomes rather than
 * throws: 'conflict' is a real answer here, not a failure, and both callers need
 * to say which one happened.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeAgendaForMeeting } from '@/lib/paprico/agendaService';
import { buildSlackAgendaBlock } from '@/lib/paprico/format';
import type { PapricoAgenda, PapricoMeeting } from '@/lib/paprico/types';

export type PublishAgendaResult =
    | {
          outcome: 'published';
          meeting: PapricoMeeting;
          agenda: PapricoAgenda;
          slackBlock: unknown;
      }
    | { outcome: 'not_found'; reason: string }
    | { outcome: 'conflict'; reason: string }
    | { outcome: 'failed'; reason: string };

export async function publishMeetingAgenda(
    supabase: SupabaseClient,
    meetingId: string
): Promise<PublishAgendaResult> {
    const { data: meeting, error } = await supabase
        .from('paprico_meeting')
        .select('*')
        .eq('id', meetingId)
        .maybeSingle();

    if (error) return { outcome: 'failed', reason: error.message };
    if (!meeting) return { outcome: 'not_found', reason: 'Meeting not found' };

    if ((meeting as PapricoMeeting).status !== 'draft') {
        return {
            outcome: 'conflict',
            reason: 'Only a draft meeting can publish its agenda.',
        };
    }

    try {
        const agenda = await computeAgendaForMeeting(supabase, meeting as PapricoMeeting);
        const publishedAt = new Date().toISOString();

        const { data: updated, error: updErr } = await supabase
            .from('paprico_meeting')
            .update({
                status: 'agenda_published',
                agenda_snapshot: agenda,
                agenda_published_at: publishedAt,
                updated_at: publishedAt,
            })
            .eq('id', meetingId)
            .eq('status', 'draft')
            .select('*')
            .maybeSingle();

        if (updErr) return { outcome: 'failed', reason: updErr.message };
        if (!updated) {
            return { outcome: 'conflict', reason: 'Meeting was published concurrently.' };
        }

        return {
            outcome: 'published',
            meeting: updated as PapricoMeeting,
            agenda,
            slackBlock: buildSlackAgendaBlock(updated as PapricoMeeting, agenda),
        };
    } catch (err) {
        console.error('[publishMeetingAgenda] failed:', err);
        return { outcome: 'failed', reason: 'Failed to publish agenda' };
    }
}
