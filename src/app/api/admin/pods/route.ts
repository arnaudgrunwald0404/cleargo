import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { sortPodsByOrder } from '@/lib/pod-utils';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

async function getHandler(req: NextRequest): Promise<NextResponse<{ error: string } | { pods: string[] }>> {
    const supabase = createClient();
    // Fetch distinct pod values from epic table
    const { data, error } = await supabase
        .from('epic')
        .select('pod')
        .neq('pod', null);
    if (error) {
        console.error('Error fetching pods:', error);
        return NextResponse.json({ error: 'Failed to fetch pods' }, { status: 500 });
    }
    // Extract distinct pods
    const podsSet = new Set<string>();
    data.forEach((row) => {
        if (row.pod) podsSet.add(row.pod);
    });
    const pods = Array.from(podsSet);
    
    // Sort pods by saved order
    const sortedPods = await sortPodsByOrder(pods);
    
    return NextResponse.json({ pods: sortedPods });
}

export const GET = withRateLimit<{ error: string } | { pods: string[] }>(getHandler, RATE_LIMITS.light);
