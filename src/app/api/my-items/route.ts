import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getReleaseNameFromAhaFields(ahaFields: unknown): string | null {
    if (!ahaFields || typeof ahaFields !== 'object') return null;
    const fields = ahaFields as Record<string, unknown>;
    const standardFields = fields.standard_fields as Record<string, unknown> | undefined;
    if (standardFields && typeof standardFields === 'object') {
        const releaseName = (standardFields.aha_release_name ?? (standardFields.release as { name?: string })?.name) as string | undefined;
        if (releaseName && typeof releaseName === 'string' && releaseName.trim()) return releaseName.trim();
    }
    const customFields = fields.custom_fields as Record<string, unknown> | undefined;
    if (customFields && typeof customFields === 'object') {
        const releaseName = customFields.release_target_after_pod_planning as string | undefined;
        if (releaseName && typeof releaseName === 'string' && releaseName.trim()) return releaseName.trim();
    }
    return null;
}

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

        // Let the database filter items using pod->PM mapping and indexes
        const { data, error } = await supabase
            .rpc('my_items_for_user', { 
                p_email: userEmail,
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
        let filtered = items.filter((i) => !archivedEpicIds.has(i.launch?.id ?? ''));

        const { data: epicsWithRelease } = await supabase
            .from('epic')
            .select('id, aha_fields')
            .in('id', epicIds);

        const epicToRelease = new Map<string, string>();
        for (const e of epicsWithRelease || []) {
            const name = getReleaseNameFromAhaFields(e.aha_fields);
            if (name) epicToRelease.set(e.id, name);
        }

        const { data: archivedReleases } = await supabase
            .from('release_schedule')
            .select('release_name')
            .eq('archived', true);

        const archivedReleaseNames = new Set((archivedReleases || []).map((r) => r.release_name));

        filtered = filtered.filter((item) => {
            const releaseName = item.launch?.id ? epicToRelease.get(item.launch.id) : null;
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

        return NextResponse.json(filtered);
    } catch (error) {
        console.error('Error fetching my items:', error);
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
    }
}
