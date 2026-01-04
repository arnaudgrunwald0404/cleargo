import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole, isAdminRole } from '@/lib/roles';
import { syncSlackHandles } from '@/lib/slack/notifications';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/slack-sync
 * Syncs Slack handles for all users by matching email addresses
 * Requires admin role
 */
export async function POST(request: NextRequest) {
    try {
        // Authentication check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Admin permission check
        const role = await resolveRole(user.email);
        if (!isAdminRole(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Sync Slack handles
        const syncResult = await syncSlackHandles();

        return NextResponse.json({
            success: true,
            message: 'Slack handle sync completed',
            ...syncResult,
        });
    } catch (error: any) {
        console.error('Slack sync error:', error);
        return NextResponse.json(
            { 
                error: error.message || 'Failed to sync Slack handles',
                success: false 
            },
            { status: 500 }
        );
    }
}

