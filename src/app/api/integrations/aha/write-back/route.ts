import { NextRequest, NextResponse } from 'next/server';
import { writeBackEpicReadiness } from '@/lib/aha/write-back';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export async function POST(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Capability check: settings.ahaFields.sync
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();

        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) throw userError;

        const rules = await getEffectivePermissionRules();
        const canSync = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.ahaFields.sync', rules);
        if (!canSync) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Parse request
        const body = await req.json();
        const { launchId } = body;

        if (!launchId) {
            return NextResponse.json({ error: 'launchId is required' }, { status: 400 });
        }

        // Trigger write-back
        await writeBackEpicReadiness(launchId);

        return NextResponse.json({ message: 'Write-back completed successfully' }, { status: 200 });

    } catch (error) {
        console.error('Write-back error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: (error as Error).message },
            { status: 500 }
        );
    }
}
