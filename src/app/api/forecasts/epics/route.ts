import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEpics } from '@/lib/aha/client';
import { getCustomFieldValue } from '@/lib/aha/mapping';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Validates the X-ClearGo-Key header as an alternative to session auth.
// This lets the /forecast skill call this endpoint without a browser session.
function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

async function getHandler(req: NextRequest) {
    const apiKeyValid = validateApiKey(req);
    if (!apiKeyValid) {
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        // Paginate through all Aha epics and keep only ClearGO Candidate = Yes
        const forecastable: {
            id: string;
            reference_num: string;
            name: string;
            ga_date: string | null;
            launch_tier: string | null;
            workflow_status: string | null;
            url: string | null;
        }[] = [];

        const perPage = 200;
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await getEpics({ per_page: perPage, page });
            let epics: any[] = [];
            if (Array.isArray(response)) {
                epics = response;
            } else if (response?.epics && Array.isArray(response.epics)) {
                epics = response.epics;
            } else if (response?.data && Array.isArray(response.data)) {
                epics = response.data;
            }

            for (const epic of epics) {
                const candidate = await getCustomFieldValue(epic, 'cleargo_candidate');
                const candidateStr = typeof candidate === 'string' ? candidate.toLowerCase() : '';
                if (candidateStr !== 'yes') continue;

                const gaDate = await getCustomFieldValue(epic, 'scheduled_ga_release_dev_only');
                const launchTier = await getCustomFieldValue(epic, 'launch_tier');
                const workflowStatus = typeof epic.workflow_status === 'object'
                    ? epic.workflow_status?.name
                    : epic.workflow_status;

                forecastable.push({
                    id: epic.id,
                    reference_num: epic.reference_num,
                    name: epic.name,
                    ga_date: typeof gaDate === 'string' ? gaDate : null,
                    launch_tier: typeof launchTier === 'string' ? launchTier : null,
                    workflow_status: workflowStatus ?? null,
                    url: epic.url ?? null,
                });
            }

            hasMore = epics.length === perPage;
            page++;
        }

        // Check which epics already have a committed forecast link
        const ahaIds = forecastable.map(e => e.reference_num);
        const existingForecasts = new Set<string>();

        if (ahaIds.length > 0) {
            const adminSupabase = createAdminClient();
            const { data: links } = await adminSupabase
                .from('epic_forecast_link')
                .select('epic_aha_id')
                .in('epic_aha_id', ahaIds);

            for (const link of links ?? []) {
                existingForecasts.add(link.epic_aha_id);
            }
        }

        const result = forecastable
            .map(epic => ({ ...epic, has_forecast: existingForecasts.has(epic.reference_num) }))
            .sort((a, b) => {
                // Sort by ga_date ascending; nulls last
                if (!a.ga_date && !b.ga_date) return 0;
                if (!a.ga_date) return 1;
                if (!b.ga_date) return -1;
                return a.ga_date.localeCompare(b.ga_date);
            });

        return NextResponse.json({ epics: result, total: result.length });
    } catch (error: any) {
        console.error('Error fetching forecastable epics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch forecastable epics', details: error.message },
            { status: 500 }
        );
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
