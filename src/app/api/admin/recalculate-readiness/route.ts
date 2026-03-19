import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeEpicReadiness } from '@/lib/readiness';
import { getSession } from '@/lib/auth';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
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

        // Fetch all epic IDs (excluding archived epics)
        const { data: epics, error: fetchError } = await supabase
            .from('epic')
            .select('id')
            .eq('archived', false);

        if (fetchError) {
            console.error('Error fetching epics:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch epics' }, { status: 500 });
        }

        if (!epics || epics.length === 0) {
            return NextResponse.json({ 
                message: 'No epics to recalculate',
                processed: 0,
                errors: []
            });
        }

        // Recalculate readiness for each epic
        const results = {
            processed: 0,
            errors: [] as Array<{ epicId: string; error: string }>
        };

        // Process epics in batches to avoid overwhelming the system
        const batchSize = 10;
        for (let i = 0; i < epics.length; i += batchSize) {
            const batch = epics.slice(i, i + batchSize);
            
            await Promise.allSettled(
                batch.map(async (epic) => {
                    try {
                        await recomputeEpicReadiness(epic.id);
                        results.processed++;
                    } catch (error: any) {
                        console.error(`Error recalculating epic ${epic.id}:`, error);
                        results.errors.push({
                            epicId: epic.id,
                            error: error.message || 'Unknown error'
                        });
                    }
                })
            );
        }

        return NextResponse.json({
            message: `Recalculated readiness for ${results.processed} epic(s)`,
            processed: results.processed,
            total: epics.length,
            errors: results.errors,
            hasErrors: results.errors.length > 0
        });
    } catch (error: any) {
        console.error('Error in recalculate-readiness endpoint:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to recalculate readiness' },
            { status: 500 }
        );
    }
}
