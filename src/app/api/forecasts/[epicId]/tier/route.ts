import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

function validateApiKey(req: NextRequest): boolean {
    const aiApiKey = process.env.CLEARGO_AI_API_KEY;
    if (!aiApiKey) return false;
    return req.headers.get('x-cleargo-key') === aiApiKey;
}

// PATCH /api/forecasts/[epicId]/tier
// Bumps an epic's launch tier to at least TIER_2.
// Only acts if current tier is TIER_3 or unset — never downgrades.
// epicId = Aha reference_num, e.g. "APP-E-670"
async function patchHandler(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    if (!validateApiKey(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { epicId: epicAhaId } = await params;
    const adminSupabase = createAdminClient();

    const { data: epic, error: fetchError } = await adminSupabase
        .from('epic')
        .select('id, aha_id, tier')
        .eq('aha_id', epicAhaId)
        .maybeSingle();

    if (fetchError) {
        return NextResponse.json({ error: 'Failed to fetch epic' }, { status: 500 });
    }
    if (!epic) {
        return NextResponse.json({ error: `Epic ${epicAhaId} not found` }, { status: 404 });
    }

    const currentTier = epic.tier;
    if (currentTier === 'TIER_1' || currentTier === 'TIER_2') {
        return NextResponse.json({
            updated: false,
            message: `Launch tier already ${currentTier} — no change`,
            tier: currentTier,
        });
    }

    const { error: updateError } = await adminSupabase
        .from('epic')
        .update({ tier: 'TIER_2' })
        .eq('id', epic.id);

    if (updateError) {
        return NextResponse.json({ error: 'Failed to update tier' }, { status: 500 });
    }

    return NextResponse.json({
        updated: true,
        message: `Bumped ${epicAhaId} from ${currentTier ?? 'unset'} → TIER_2`,
        previous_tier: currentTier,
        tier: 'TIER_2',
    });
}

export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
