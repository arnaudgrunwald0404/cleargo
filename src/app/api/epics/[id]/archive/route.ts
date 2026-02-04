import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/epics';
import { getAhaClient } from '@/lib/aha/client';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/epics/[id]/archive
 * Sets ClearGO Candidate to No in Aha and marks the epic as archived in ClearGO.
 * Requires launch.delete permission.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const userEmail = await getAuthenticatedUserEmail();

        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
            .single();

        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }

        const roles = (me?.roles as string[]) || [];
        const { canRolesPerform } = await import('@/lib/permissions');
        const ok = await canRolesPerform(roles, 'launch.delete');
        if (!ok) {
            return NextResponse.json({ error: 'Forbidden: cannot archive epic' }, { status: 403 });
        }

        const epic = await getEpic(id);
        if (!epic) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }
        if (!epic.aha_id) {
            return NextResponse.json(
                { error: 'Epic has no Aha link; cannot archive from ClearGO' },
                { status: 400 }
            );
        }

        const client = getAhaClient();
        await client.updateEpicCustomFields(epic.aha_id, { cleargo_candidate: 'No' });

        const { error: updateError } = await supabase
            .from('epic')
            .update({ archived: true, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (updateError) {
            console.error('Failed to set epic archived in DB:', updateError);
            return NextResponse.json(
                { error: 'Aha updated but failed to archive epic in ClearGO' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error archiving epic:', error);
        const message = error instanceof Error ? error.message : 'Failed to archive epic';
        return NextResponse.json(
            { error: message },
            { status: message.includes('Aha API') || message.includes('401') ? 502 : 500 }
        );
    }
}
