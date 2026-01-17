import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

async function handler(req: NextRequest) {
    try {
        const { ids } = await req.json();
        
        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'Invalid request: ids must be a non-empty array' }, { status: 400 });
        }
        
        // Limit batch size to prevent abuse
        const batchIds = ids.slice(0, 50);
        
        const supabase = createClient();
        const { data, error } = await supabase
            .from('epic')
            .select('*')
            .in('id', batchIds);
        
        if (error) {
            console.error('Error fetching epics batch:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        
        // Return as object keyed by ID for easy lookup
        const result: Record<string, any> = {};
        if (data) {
            data.forEach(epic => {
                result[epic.id] = epic;
            });
        }
        
        // Ensure all requested IDs are in the result (even if null for missing ones)
        batchIds.forEach(id => {
            if (!(id in result)) {
                result[id] = null;
            }
        });
        
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in batch epic handler:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

export const POST = withRateLimit(handler, RATE_LIMITS.default);
