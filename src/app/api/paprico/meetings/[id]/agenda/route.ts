/**
 * GET /api/paprico/meetings/[id]/agenda
 *
 * The agenda is computed on read (spec §4): each load synchronizes the item
 * registry — materializing release items whose gating criterion is open inside
 * the lookahead window, and auto-closing items whose criterion flipped complete
 * (acceptance #4) — then returns the four agenda sections.
 *
 * For a published/held meeting the frozen agenda_snapshot is returned instead
 * of the live computation (acceptance #11), with a map of live item statuses so
 * the UI can overlay in-meeting progress.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePapricoReader } from '@/lib/paprico/apiHelpers';
import { computeAgendaForMeeting } from '@/lib/paprico/agendaService';
import type { PapricoAgenda, PapricoMeeting } from '@/lib/paprico/types';

export const dynamic = 'force-dynamic';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;
    const { id } = await params;

    const sb = createAdminClient();
    const { data: meeting, error } = await sb
        .from('paprico_meeting')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });

    try {
        // Always run the registry sync so completed work closes itself out,
        // whatever the meeting status.
        const liveAgenda = await computeAgendaForMeeting(sb, meeting as PapricoMeeting);

        const typedMeeting = meeting as PapricoMeeting;
        const useSnapshot = typedMeeting.status !== 'draft' && typedMeeting.agenda_snapshot != null;
        const agenda: PapricoAgenda = useSnapshot ? (typedMeeting.agenda_snapshot as PapricoAgenda) : liveAgenda;

        // Live status overlay for snapshot views (decided/deferred/closed during the meeting).
        let liveItemStatus: Record<string, { status: string; decision_count: number }> = {};
        if (useSnapshot) {
            const snapshotIds = [
                ...agenda.overdue_critical,
                ...agenda.approaching,
                ...agenda.standing,
            ].map((i) => i.id);
            if (snapshotIds.length > 0) {
                const [{ data: liveItems }, { data: decisionRows }] = await Promise.all([
                    sb.from('paprico_item').select('id, status').in('id', snapshotIds),
                    sb.from('paprico_decision').select('item_id').in('item_id', snapshotIds),
                ]);
                const counts = new Map<string, number>();
                for (const d of decisionRows ?? []) {
                    counts.set(d.item_id, (counts.get(d.item_id) ?? 0) + 1);
                }
                liveItemStatus = Object.fromEntries(
                    (liveItems ?? []).map((i) => [
                        i.id,
                        { status: i.status as string, decision_count: counts.get(i.id) ?? 0 },
                    ])
                );
            }
        }

        return NextResponse.json({
            meeting,
            agenda,
            is_snapshot: useSnapshot,
            live_item_status: liveItemStatus,
        });
    } catch (err) {
        console.error('PaPriCo agenda computation failed:', err);
        return NextResponse.json({ error: 'Failed to compute agenda' }, { status: 500 });
    }
}
