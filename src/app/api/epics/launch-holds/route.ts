/**
 * Which epics are on Launch Hold.
 *
 * An epic is on hold when it ships BEFORE the launch it belongs to and RevOps has
 * not cleared it — live before it can be quoted or sold. See src/lib/launchHold.ts
 * for why RevOps specifically.
 *
 * Served as its own endpoint rather than widened into the main epics query so the
 * release list keeps rendering if this fails: a hold is a warning layered on top,
 * not something the list depends on.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { resolveLaunchHolds } from '@/lib/services/launchHoldService';

export const dynamic = 'force-dynamic';

async function getHandler() {
    try {
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createClient();

        // Only epics that are actually on a launch can be held, and only a handful
        // are, so fetch the linked set rather than every epic.
        const { data: linked, error: linkedError } = await supabase
            .from('launch_epic')
            .select('epic_id, epic:epic(id, target_launch_date, archived)');

        if (linkedError) {
            return NextResponse.json({ error: linkedError.message }, { status: 500 });
        }

        const epics = (linked || [])
            .map((row) => {
                const e = (Array.isArray(row.epic) ? row.epic[0] : row.epic) as
                    | { id: string; target_launch_date: string | null; archived: boolean | null }
                    | null;
                return e && !e.archived
                    ? { id: e.id, target_launch_date: e.target_launch_date }
                    : null;
            })
            .filter(Boolean) as Array<{ id: string; target_launch_date: string | null }>;

        const holds = await resolveLaunchHolds(supabase, epics);

        return NextResponse.json({
            holds: Object.fromEntries(holds),
        });
    } catch (error: any) {
        console.error('Error in GET /api/epics/launch-holds:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
