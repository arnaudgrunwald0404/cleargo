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

