import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/auth-helpers';
import {
    computeCriterionDueDateYmd,
    getReleaseNameFromAhaFields,
    getUiFrameworkDueDateOptions,
    resolveAnchorLaunchDateFromReleaseSchedule,
} from '@/lib/criterion-due-date';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        // Check for custom lr_session cookie (used by magic link)
        const session = await getSession();
        const sessionEmail = session?.email;
        
        // Use email from Supabase auth or from lr_session cookie
        const userEmail = user?.email || sessionEmail;

        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get query parameter for showing all items vs pending only
        const { searchParams } = new URL(req.url);
        const showAll = searchParams.get('showAll') === 'true';
        const viewAsEmailParam = searchParams.get('viewAsEmail');
        const viewAsEmail = typeof viewAsEmailParam === 'string' && viewAsEmailParam.trim() ? viewAsEmailParam.trim() : null;

        let effectiveEmail = userEmail;
        if (viewAsEmail) {
            if (!isSuperAdmin(userEmail)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            const { data: targetUser } = await supabase
                .from('app_user')
                .select('email')
                .ilike('email', viewAsEmail)
                .maybeSingle();
            if (!targetUser?.email) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            effectiveEmail = targetUser.email;
        }

        // Let the database filter items using pod->PM mapping and indexes
        const { data, error } = await supabase
            .rpc('my_items_for_user', { 
                p_email: effectiveEmail,
                p_show_all: showAll
            });

        if (error) throw error;

        const items = (data || []) as Array<{ launch?: { id?: string } }>;
        if (items.length === 0) {
            return NextResponse.json([]);
        }

        const epicIds = [...new Set(items.map((i) => i.launch?.id).filter(Boolean))] as string[];
        if (epicIds.length === 0) {
            return NextResponse.json(items);
        }

        const { data: archivedEpics } = await supabase
            .from('epic')
            .select('id')
            .in('id', epicIds)
            .eq('archived', true);

        const archivedEpicIds = new Set((archivedEpics || []).map((e) => e.id));
        let filtered: Array<Record<string, unknown>> = items.filter((i) =>
            !archivedEpicIds.has(i.launch?.id ?? '')
        ) as Array<Record<string, unknown>>;

        const { data: epicsWithRelease } = await supabase
            .from('epic')
            .select('id, aha_fields, target_launch_date')
            .in('id', epicIds);

        const epicToRelease = new Map<string, string>();
        const epicRowById = new Map<
            string,
            { id: string; aha_fields: unknown; target_launch_date: string | null }
        >();
        for (const e of epicsWithRelease || []) {
            epicRowById.set(e.id, e as { id: string; aha_fields: unknown; target_launch_date: string | null });
            const name = getReleaseNameFromAhaFields(e.aha_fields);
            if (name) epicToRelease.set(e.id, name);
        }

        const [{ data: scheduleRows }, { data: allStages }] = await Promise.all([
            supabase.from('release_schedule').select('release_name, launch_date').eq('archived', false),
            supabase
                .from('release_stages')
                .select('id, name, sort_order, duration_days, level_durations, scope')
                .order('sort_order', { ascending: true }),
        ]);

        const defaultRatingTimingId =
            (allStages || []).find((s) => (s as { sort_order?: number }).sort_order === 1)?.id ?? (allStages || [])[0]?.id ?? null;

        const { data: archivedReleases } = await supabase
            .from('release_schedule')
            .select('release_name')
            .eq('archived', true);

        const archivedReleaseNames = new Set((archivedReleases || []).map((r) => r.release_name));

        filtered = filtered.filter((item) => {
            const launch = item.launch as { id?: string } | undefined;
            const releaseName = launch?.id ? epicToRelease.get(launch.id) : null;
            if (!releaseName) return true;
            return !archivedReleaseNames.has(releaseName);
        });

        const statusIds = filtered.map((i) => (i as { id?: string }).id).filter((id): id is string => typeof id === 'string' && id.length > 0);
        if (statusIds.length > 0) {
            const { data: statusRows } = await supabase
                .from('epic_criterion_status')
                .select('id, criterion_id')
                .in('id', statusIds);
            const criterionIdByStatusId = new Map(
                (statusRows || []).map((r) => [r.id, r.criterion_id])
            );
            const criterionIds = [...new Set((statusRows || []).map((r) => r.criterion_id).filter(Boolean))] as string[];
            if (criterionIds.length > 0) {
                const { data: criteriaRows } = await supabase
                    .from('criterion')
                    .select('id, status_definition_go, status_definition_conditional, status_definition_no_go')
                    .in('id', criterionIds);
                const defByCriterionId = new Map(
                    (criteriaRows || []).map((r) => [
                        r.id,
                        {
                            status_definition_go: r.status_definition_go ?? null,
                            status_definition_conditional: r.status_definition_conditional ?? null,
                            status_definition_no_go: r.status_definition_no_go ?? null,
                        },
                    ])
                );
                filtered = (filtered as Array<Record<string, unknown>>).map((item) => {
                    const statusId = (item as { id?: string }).id;
                    const cid = statusId ? criterionIdByStatusId.get(statusId) : null;
                    const defs = cid ? defByCriterionId.get(cid) : null;
                    if (!defs || !item.criterion || typeof item.criterion !== 'object') return item;
                    return {
                        ...item,
                        criterion: {
                            ...(item.criterion as object),
                            status_definition_go: defs.status_definition_go,
                            status_definition_conditional: defs.status_definition_conditional,
                            status_definition_no_go: defs.status_definition_no_go,
                        },
                    };
                });
            }
        }

        const stagesForDue = allStages ?? [];
        const scheduleForDue = scheduleRows ?? [];

        filtered = (filtered as Array<Record<string, unknown>>).map((row) => {
            const item = row as {
                launch?: { id?: string; [key: string]: unknown };
                criterion?: { rating_timing?: number | null };
            };
            const launchId = item.launch?.id;
            const epicRow = launchId ? epicRowById.get(launchId) : undefined;
            const launchEnriched =
                item.launch && epicRow
                    ? {
                          ...item.launch,
                          aha_fields: epicRow.aha_fields ?? null,
                      }
                    : item.launch;
            const releaseName =
                (launchId && epicToRelease.get(launchId)) || getReleaseNameFromAhaFields(epicRow?.aha_fields) || null;
            const anchor = resolveAnchorLaunchDateFromReleaseSchedule(
                releaseName,
                scheduleForDue,
                epicRow?.target_launch_date ?? null
            );
            const rawRt = item.criterion?.rating_timing;
            const ratingTimingId =
                rawRt != null && rawRt !== undefined ? Number(rawRt) : defaultRatingTimingId;
            const uiOpts = getUiFrameworkDueDateOptions(epicRow?.aha_fields);
            const due_date = computeCriterionDueDateYmd({
                anchorYmd: anchor,
                ratingTimingId: ratingTimingId ?? null,
                allStages: stagesForDue,
                uiLevel: uiOpts.isUiFramework ? uiOpts.uiLevel : undefined,
            });
            return { ...row, launch: launchEnriched, due_date };
        });

        return NextResponse.json(filtered);
    } catch (error) {
        console.error('Error fetching my items:', error);
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
    }
}
