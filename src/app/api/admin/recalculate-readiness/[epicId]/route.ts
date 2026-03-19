import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeEpicReadiness } from '@/lib/readiness';
import { getSession } from '@/lib/auth';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ epicId: string }> }
) {
    try {
        const { epicId } = await params;
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

        // Check if user has admin permissions (SUPERADMIN, PRODUCT_OPS, or CPO)
        const { data: appUser } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
            .single();

        if (!appUser || !appUser.roles || !Array.isArray(appUser.roles)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Capability check: settings.update
        const rules = await getEffectivePermissionRules();
        const canUpdate = canRolesPerformWithRules((appUser.roles as string[]) || [], 'settings.update', rules);
        if (!canUpdate) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Verify epic exists
        const { data: epic, error: epicError } = await supabase
            .from('epic')
            .select('id, name')
            .eq('id', epicId)
            .single();

        if (epicError || !epic) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }

        // Recalculate readiness for this epic
        try {
            await recomputeEpicReadiness(epicId);
            
            // Fetch updated epic to return the new score
            const { data: updatedEpic } = await supabase
                .from('epic')
                .select('readiness_score, readiness_status, risk_level, updated_at')
                .eq('id', epicId)
                .single();

            return NextResponse.json({
                message: `Recalculated readiness for epic: ${epic.name}`,
                epicId: epicId,
                epicName: epic.name,
                readiness_score: updatedEpic?.readiness_score,
                readiness_status: updatedEpic?.readiness_status,
                risk_level: updatedEpic?.risk_level,
                updated_at: updatedEpic?.updated_at
            });
        } catch (error: any) {
            console.error(`Error recalculating epic ${epicId}:`, error);
            return NextResponse.json({
                error: error.message || 'Failed to recalculate readiness',
                epicId: epicId
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error('Error in recalculate-readiness endpoint:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to recalculate readiness' },
            { status: 500 }
        );
    }
}
