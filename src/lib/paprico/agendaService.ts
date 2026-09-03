import type { SupabaseClient } from '@supabase/supabase-js';
import {
    buildCategoryStageFallbackMap,
    computeCriterionDueDateYmd,
    getReleaseNameFromAhaFields,
    getUiFrameworkDueDateOptions,
    resolveAnchorLaunchDateFromReleaseSchedule,
    type CriterionDueDateStageRow,
} from '@/lib/criterion-due-date';
import { addCalendarDaysToYmd, getCalendarDateStringInTimeZone } from '@/lib/date-utils';
import {
    appendSystemNote,
    autoCloseNote,
    commitmentAgeDays,
    compareAgendaItems,
    composeReleaseItemTitle,
    computeUrgencyBand,
    daysToStage,
    DEFAULT_LOOKAHEAD_DAYS,
    isCriterionStatusComplete,
    isWithinLookahead,
    OPEN_COMMITMENT_WINDOW_DAYS,
    PAPRICO_TIMEZONE,
    sectionForItem,
    totalTimeBoxMinutes,
} from './agenda';
import type {
    AgendaItem,
    OpenCommitment,
    PapricoAgenda,
    PapricoItem,
    PapricoMeeting,
} from './types';

type EpicRow = {
    id: string;
    name: string;
    tier: string | null;
    status: string | null;
    target_launch_date: string | null;
    aha_fields: unknown;
};

type CriterionRow = {
    id: string;
    label: string;
    category: string | null;
    gate: boolean | null;
    rating_timing: number | null;
    is_active: boolean;
};

/** Everything the agenda needs, loaded in one parallel round trip (no N+1, spec §6). */
async function loadAgendaInputs(sb: SupabaseClient) {
    const [gatingRes, itemsRes, settingsRes, scheduleRes, stagesRes] = await Promise.all([
        sb.from('paprico_gating_criterion').select('criterion_id, enabled, lookahead_days'),
        sb.from('paprico_item').select('*').neq('status', 'closed'),
        sb.from('app_settings').select('paprico_default_lookahead_days').order('id', { ascending: true }).limit(1),
        sb.from('release_schedule').select('release_name, launch_date, cohort2_date').eq('archived', false),
        sb
            .from('release_stages')
            .select('id, name, sort_order, duration_days, level_durations, scope, is_gate')
            .order('sort_order', { ascending: true }),
    ]);

    for (const res of [gatingRes, itemsRes, scheduleRes, stagesRes]) {
        if (res.error) throw res.error;
    }

    const gating = (gatingRes.data ?? []).filter((g) => g.enabled);
    const gatingIds = gating.map((g) => g.criterion_id);
    const openItems = (itemsRes.data ?? []) as PapricoItem[];

    // Criteria referenced by gating config or by existing items (orphan-safe superset).
    const criterionIds = [
        ...new Set([
            ...gatingIds,
            ...openItems.map((i) => i.criterion_id).filter((id): id is string => !!id),
        ]),
    ];

    const [criteriaRes, statusRes] = await Promise.all([
        criterionIds.length > 0
            ? sb.from('criterion').select('id, label, category, gate, rating_timing, is_active').in('id', criterionIds)
            : Promise.resolve({ data: [], error: null }),
        gatingIds.length > 0
            ? sb.from('epic_criterion_status').select('epic_id, criterion_id, status').in('criterion_id', gatingIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (criteriaRes.error) throw criteriaRes.error;
    if (statusRes.error) throw statusRes.error;

    const statusRows = (statusRes.data ?? []) as Array<{ epic_id: string; criterion_id: string; status: string }>;

    // Epics referenced by criterion statuses or existing items.
    const epicIds = [
        ...new Set([
            ...statusRows.map((s) => s.epic_id),
            ...openItems.map((i) => i.epic_id).filter((id): id is string => !!id),
        ]),
    ];
    const epicsRes =
        epicIds.length > 0
            ? await sb
                  .from('epic')
                  .select('id, name, tier, status, target_launch_date, aha_fields')
                  .in('id', epicIds)
                  .eq('archived', false)
                  .neq('status', 'Cancelled')
            : { data: [], error: null };
    if (epicsRes.error) throw epicsRes.error;

    const defaultLookahead =
        (settingsRes.data?.[0] as { paprico_default_lookahead_days?: number } | undefined)
            ?.paprico_default_lookahead_days ?? DEFAULT_LOOKAHEAD_DAYS;

    return {
        gating,
        openItems,
        defaultLookahead,
        schedule: (scheduleRes.data ?? []) as Array<{ release_name: string; launch_date: string | null; cohort2_date?: string | null }>,
        stages: (stagesRes.data ?? []) as CriterionDueDateStageRow[],
        criteria: (criteriaRes.data ?? []) as CriterionRow[],
        statusRows,
        epics: (epicsRes.data ?? []) as EpicRow[],
    };
}

/** Stage date (YYYY-MM-DD) for a gating criterion on an epic's launch timeline. */
function computeStageDateForPair(
    epic: EpicRow,
    criterion: CriterionRow,
    schedule: Array<{ release_name: string; launch_date: string | null; cohort2_date?: string | null }>,
    stages: CriterionDueDateStageRow[]
): { stageDate: string | null; stageName: string | null; releaseName: string | null } {
    const releaseName = getReleaseNameFromAhaFields(epic.aha_fields);
    const anchor = resolveAnchorLaunchDateFromReleaseSchedule(releaseName, schedule, epic.target_launch_date);
    const scheduleRow = releaseName
        ? schedule.find((r) => (r.release_name || '').trim() === releaseName.trim())
        : null;
    const cohort2Date = scheduleRow?.cohort2_date ?? null;
    const uiOpts = getUiFrameworkDueDateOptions(epic.aha_fields);

    // Ready-By stage: criterion.rating_timing, falling back to the category → stage map
    // when unset (same fallback the rest of the app uses for due dates).
    let ratingTimingId = criterion.rating_timing ?? null;
    if (ratingTimingId == null && criterion.category) {
        const fallbackMap = buildCategoryStageFallbackMap(
            stages.map((s) => ({ id: s.id, name: s.name ?? '' })),
            uiOpts.isUiFramework
        );
        ratingTimingId = fallbackMap.get(criterion.category.toLowerCase().trim()) ?? null;
    }

    const stageDate = computeCriterionDueDateYmd({
        anchorYmd: anchor,
        ratingTimingId,
        allStages: stages,
        uiLevel: uiOpts.isUiFramework ? uiOpts.uiLevel : undefined,
        isGateCriterion: criterion.gate === true,
        cohort2Date,
    });
    const stageName = ratingTimingId != null ? (stages.find((s) => s.id === ratingTimingId)?.name ?? null) : null;
    return { stageDate, stageName, releaseName };
}

/**
 * Compute the agenda for a meeting, keeping the item registry in sync on the way
 * (spec §4: computed on read — materializes missing release items, auto-closes
 * items whose gating criterion flipped complete). Idempotent.
 */
export async function computeAgendaForMeeting(
    sb: SupabaseClient,
    meeting: Pick<PapricoMeeting, 'meeting_date'>,
    options?: { todayYmd?: string }
): Promise<PapricoAgenda> {
    const today = options?.todayYmd ?? getCalendarDateStringInTimeZone(PAPRICO_TIMEZONE);
    const inputs = await loadAgendaInputs(sb);
    const { gating, defaultLookahead, schedule, stages, criteria, statusRows, epics } = inputs;
    let { openItems } = inputs;

    const criterionById = new Map(criteria.map((c) => [c.id, c]));
    const epicById = new Map(epics.map((e) => [e.id, e]));
    const statusByPair = new Map(statusRows.map((s) => [`${s.epic_id}:${s.criterion_id}`, s.status]));
    const lookaheadByCriterion = new Map(gating.map((g) => [g.criterion_id, g.lookahead_days ?? defaultLookahead]));

    // 1. Auto-close release items whose criterion is now complete for the epic.
    //    Only proposed/on_agenda/deferred close themselves (spec §4) — blocked and
    //    decided items keep their state for the room to see.
    const AUTO_CLOSABLE = new Set(['proposed', 'on_agenda', 'deferred']);
    const noteText = autoCloseNote(today);
    const toClose = openItems.filter((item) => {
        if (item.source !== 'release' || !item.epic_id || !item.criterion_id) return false;
        if (!AUTO_CLOSABLE.has(item.status)) return false;
        return isCriterionStatusComplete(statusByPair.get(`${item.epic_id}:${item.criterion_id}`));
    });
    if (toClose.length > 0) {
        await Promise.all(
            toClose.map((item) =>
                sb
                    .from('paprico_item')
                    .update({
                        status: 'closed',
                        auto_closed: true,
                        system_notes: appendSystemNote(item.system_notes, noteText),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', item.id)
                    .neq('status', 'closed')
            )
        );
        const closedIds = new Set(toClose.map((i) => i.id));
        openItems = openItems.filter((i) => !closedIds.has(i.id));
    }

    // 2. Materialize missing release items for pairs inside the agenda window.
    const openPairs = new Set(
        openItems
            .filter((i) => i.source === 'release' && i.epic_id && i.criterion_id)
            .map((i) => `${i.epic_id}:${i.criterion_id}`)
    );
    const stageInfoByPair = new Map<string, { stageDate: string | null; stageName: string | null; releaseName: string | null }>();
    const inserts: Array<Record<string, unknown>> = [];
    for (const s of statusRows) {
        if (isCriterionStatusComplete(s.status)) continue;
        const epic = epicById.get(s.epic_id);
        const criterion = criterionById.get(s.criterion_id);
        if (!epic || !criterion) continue;
        const pairKey = `${s.epic_id}:${s.criterion_id}`;
        const info = computeStageDateForPair(epic, criterion, schedule, stages);
        stageInfoByPair.set(pairKey, info);
        if (openPairs.has(pairKey)) continue;
        const lookahead = lookaheadByCriterion.get(s.criterion_id) ?? defaultLookahead;
        if (!isWithinLookahead(info.stageDate, meeting.meeting_date, lookahead)) continue;
        openPairs.add(pairKey);
        inserts.push({
            source: 'release',
            epic_id: s.epic_id,
            criterion_id: s.criterion_id,
            title: composeReleaseItemTitle(epic.name, criterion.label),
            category: criterion.category,
            status: 'proposed',
            created_by: 'system:agenda-sync',
        });
    }
    if (inserts.length > 0) {
        const { data: inserted, error } = await sb.from('paprico_item').insert(inserts).select('*');
        // 23505 = a concurrent reader materialized the same pair; safe to ignore.
        if (error && error.code !== '23505') throw error;
        if (inserted) openItems = [...openItems, ...(inserted as PapricoItem[])];
    }

    // 3. Enrich every open item into an agenda row.
    const decisionCounts = new Map<string, number>();
    if (openItems.length > 0) {
        const { data: decisionRows } = await sb
            .from('paprico_decision')
            .select('item_id')
            .in('item_id', openItems.map((i) => i.id));
        for (const d of decisionRows ?? []) {
            decisionCounts.set(d.item_id, (decisionCounts.get(d.item_id) ?? 0) + 1);
        }
    }

    const agendaItems: AgendaItem[] = openItems.map((item) => {
        const epic = item.epic_id ? epicById.get(item.epic_id) : undefined;
        const criterion = item.criterion_id ? criterionById.get(item.criterion_id) : undefined;
        const pairKey = item.epic_id && item.criterion_id ? `${item.epic_id}:${item.criterion_id}` : null;
        let info = pairKey ? stageInfoByPair.get(pairKey) : undefined;
        if (!info && item.source === 'release' && epic && criterion) {
            info = computeStageDateForPair(epic, criterion, schedule, stages);
        }
        const stageDate = info?.stageDate ?? null;
        const days = item.source === 'release' ? daysToStage(stageDate, today) : null;
        return {
            ...item,
            epic_name: epic?.name ?? null,
            release_name: info?.releaseName ?? null,
            tier: (epic?.tier as AgendaItem['tier']) ?? null,
            criterion_label: criterion?.label ?? null,
            stage_name: info?.stageName ?? null,
            stage_date: stageDate,
            days_to_stage: days,
            band: item.source === 'release' ? computeUrgencyBand(days) : null,
            orphaned: item.source === 'release' && (!epic || !criterion),
            decision_count: decisionCounts.get(item.id) ?? 0,
        };
    });

    // 4. Open commitments: decisions with an owner and due date, not complete,
    //    due in the past or within the window (spec §4, acceptance #10).
    const dueCutoff = addCalendarDaysToYmd(today, OPEN_COMMITMENT_WINDOW_DAYS) ?? today;
    const { data: commitmentRows, error: commitmentError } = await sb
        .from('paprico_decision')
        .select('*, item:paprico_item(title)')
        .is('completed_at', null)
        .not('owner_email', 'is', null)
        .not('due_date', 'is', null)
        .lte('due_date', dueCutoff)
        .order('due_date', { ascending: true });
    if (commitmentError) throw commitmentError;

    const openCommitments: OpenCommitment[] = (commitmentRows ?? []).map((row) => {
        const { item, ...decision } = row as OpenCommitment & { item: { title: string } | null };
        return {
            ...decision,
            item_title: item?.title ?? null,
            age_days: commitmentAgeDays(decision.due_date, today),
        };
    });

    const sections: Record<'overdue_critical' | 'approaching' | 'standing', AgendaItem[]> = {
        overdue_critical: [],
        approaching: [],
        standing: [],
    };
    for (const item of agendaItems) {
        sections[sectionForItem(item)].push(item);
    }
    sections.overdue_critical.sort(compareAgendaItems);
    sections.approaching.sort(compareAgendaItems);
    // Standing items keep the chair-controlled order.
    sections.standing.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));

    return {
        computed_at: new Date().toISOString(),
        today,
        open_commitments: openCommitments,
        overdue_critical: sections.overdue_critical,
        approaching: sections.approaching,
        standing: sections.standing,
        total_time_box_minutes: totalTimeBoxMinutes(agendaItems),
    };
}
