import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: launchStages.manage
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        const { canRolesPerform } = await import('@/lib/permissions');
        const ok = await canRolesPerform((me?.roles as string[]) || [], 'launchStages.manage');
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const id = parseInt(params.id);
        if (isNaN(id)) {
            return NextResponse.json(
                { error: 'Invalid ID' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('launch_stages')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting launch stage:', error);
            return NextResponse.json(
                { error: 'Failed to delete launch stage', details: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /api/launch-stages/[id]:', error);
        return NextResponse.json(
            { error: 'Failed to delete launch stage', details: error.message },
            { status: 500 }
        );
    }
}

