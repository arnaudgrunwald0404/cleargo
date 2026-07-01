import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

const CreateLinkSchema = z.object({
    url: z.string().url('url must be a valid URL'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
    scenario: z.string().default('base'),
    arr_upside_3yr: z.number().int().nonnegative().optional(),
    arr_upside_2026: z.number().int().nonnegative().optional(),
    arr_upside_2027: z.number().int().nonnegative().optional(),
    arr_incremental_2027: z.number().int().nonnegative().optional(),
    arr_incremental_2028: z.number().int().nonnegative().optional(),
    arr_churn_reduction_2027: z.number().int().nonnegative().optional(),
    arr_churn_reduction_2028: z.number().int().nonnegative().optional(),
});

// GET /api/forecasts/[epicId]/link
// Returns all forecast links for an epic, most recent first.
// epicId = Aha reference_num, e.g. "APP-E-1210"
async function getHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    const apiKeyValid = validateApiKey(req);
    if (!apiKeyValid) {
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { epicId: epicAhaId } = await params;
    const adminSupabase = createAdminClient();

    const { data: links, error } = await adminSupabase
        .from('epic_forecast_link')
        .select('id, epic_aha_id, url, generation_date, scenario, arr_upside_3yr_usd, storage_path, created_at, created_by')
        .eq('epic_aha_id', epicAhaId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching forecast links:', error);
        return NextResponse.json({ error: 'Failed to fetch forecast links' }, { status: 500 });
    }

    return NextResponse.json({ links: links ?? [] });
}

// POST /api/forecasts/[epicId]/link
// Creates a structured forecast association for an externally-hosted URL.
// Use this when the HTML is already deployed (e.g. via Netlify) and you just
// want to register the link + metadata in ClearGo.
//
// Body: { url, date?, scenario?, arr_upside_3yr? }
// epicId = Aha reference_num, e.g. "APP-E-1210"
async function postHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    const apiKeyValid = validateApiKey(req);
    let userEmail: string | null = null;

    if (!apiKeyValid) {
        userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const { epicId: epicAhaId } = await params;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = CreateLinkSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const { url, date, scenario, arr_upside_3yr, arr_upside_2026, arr_upside_2027, arr_incremental_2027, arr_incremental_2028, arr_churn_reduction_2027, arr_churn_reduction_2028 } = parsed.data;
    const adminSupabase = createAdminClient();

    // Look up the internal epic UUID (may not exist if Aha sync hasn't run yet)
    const { data: epicRow } = await adminSupabase
        .from('epic')
        .select('id')
        .eq('aha_id', epicAhaId)
        .maybeSingle();

    const { data: link, error } = await adminSupabase
        .from('epic_forecast_link')
        .insert({
            epic_id: epicRow?.id ?? null,
            epic_aha_id: epicAhaId,
            url,
            generation_date: date ?? new Date().toISOString().split('T')[0],
            scenario,
            arr_upside_3yr_usd: arr_upside_3yr ?? null,
            arr_upside_2026_usd: arr_upside_2026 ?? null,
            arr_upside_2027_usd: arr_upside_2027 ?? null,
            arr_incremental_2027_usd: arr_incremental_2027 ?? null,
            arr_incremental_2028_usd: arr_incremental_2028 ?? null,
            arr_churn_reduction_2027_usd: arr_churn_reduction_2027 ?? null,
            arr_churn_reduction_2028_usd: arr_churn_reduction_2028 ?? null,
            created_by: userEmail ?? 'api-key',
        })
        .select()
        .single();

    if (error) {
        console.error('DB insert error:', error);
        return NextResponse.json({ error: 'Failed to create forecast link' }, { status: 500 });
    }

    return NextResponse.json(link, { status: 201 });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
