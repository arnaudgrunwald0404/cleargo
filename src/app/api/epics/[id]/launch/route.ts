import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

async function getHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createClient();
        const { data, error } = await supabase
            .from('launch_epic')
            .select('launch_id, launch:launch(id, name, tier, archived)')
            .eq('epic_id', id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            launch_id: data?.launch_id || null,
            launch: data?.launch || null,
        });
    } catch (error: any) {
        console.error('Error in GET /api/epics/[id]/launch:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
