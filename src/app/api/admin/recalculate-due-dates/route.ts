import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recalculateDueDatesForEpic } from '@/lib/db/epics';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const session = await getSession();
        const sessionEmail = session?.email;
        const userEmail = user?.email || sessionEmail;

        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check for admin-level roles
        const { data: appUser } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
            .single();

        if (!appUser || !appUser.roles || !Array.isArray(appUser.roles)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const normalizedRoles = appUser.roles.map((r: string) => String(r).toUpperCase());
        const hasAdminRole = normalizedRoles.includes('SUPERADMIN') ||
                            normalizedRoles.includes('PRODUCT_OPS') ||
                            normalizedRoles.includes('CPO');

        if (!hasAdminRole) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Fetch all active epics
        const { data: epics, error: epicsError } = await supabase
            .from('epic')
            .select('id, name')
            .eq('archived', false);

        if (epicsError) {
            return NextResponse.json({ error: 'Failed to fetch epics', details: epicsError.message }, { status: 500 });
        }

        if (!epics || epics.length === 0) {
            return NextResponse.json({ message: 'No active epics found', updated: 0 });
        }

        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const epic of epics) {
            try {
                await recalculateDueDatesForEpic(epic.id, supabase);
                successCount++;
            } catch (err: any) {
                errorCount++;
                errors.push(`${epic.name}: ${err.message}`);
            }
        }

        return NextResponse.json({
            message: `Recalculated due dates for ${successCount} epics`,
            successCount,
            errorCount,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Error recalculating due dates:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
