import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeLaunchReadiness } from '@/lib/readiness';

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string; lcsId: string } }
) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { status, notes, condition, condition_due_date, condition_owner_id } = body;

        // Update the status
        const { data, error } = await supabase
            .from('launch_criterion_status')
            .update({
                status,
                current_status_notes: notes,
                condition,
                condition_due_date,
                condition_owner_id,
                last_updated_at: new Date().toISOString(),
                last_updated_by: user.id
            })
            .eq('id', params.lcsId)
            .eq('launch_id', params.id) // Security check
            .select()
            .single();

        if (error) throw error;

        // Trigger readiness re-computation asynchronously (or await if we want immediate consistency)
        await recomputeLaunchReadiness(params.id);

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error updating criterion status:', error);
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }
}
