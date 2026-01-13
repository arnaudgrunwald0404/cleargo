import { NextRequest, NextResponse } from 'next/server';
import { createEpic, getEpics } from '@/lib/epics';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest) {
    try {
        // AUTH DISABLED: Skip auth check, just fetch epics
        const epics = await getEpics();
        console.log('API /epics: Returning', Array.isArray(epics) ? epics.length : 'not an array', 'epics');
        return NextResponse.json(epics);
    } catch (error: any) {
        console.error('Error fetching epics:', error);
        console.error('Error details:', error.message, error.stack);
        return NextResponse.json({ 
            error: 'Failed to fetch epics',
            details: error.message 
        }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);

export async function POST(req: NextRequest) {
    // Manual epic creation is disabled - epics should only be created via Aha! integration
    return NextResponse.json({ 
        error: 'Manual epic creation is disabled. Epics are created automatically via Aha! integration.' 
    }, { status: 403 });
}
