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

        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get app_user ID from email
        const { data: appUser, error: userError } = await supabase
            .from('app_user')
            .select('id')
            .eq('email', user.email)
            .single();

        if (userError || !appUser) {
            console.error('Failed to find app_user:', userError);
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        const body = await req.json();
        const { status, notes, condition, condition_due_date, condition_owner_id } = body;

        console.log('Updating criterion status:', { 
            lcsId: params.lcsId, 
            launchId: params.id, 
            status,
            appUserId: appUser.id,
            body 
        });

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
                last_updated_by: appUser.id
            })
            .eq('id', params.lcsId)
            .eq('launch_id', params.id) // Security check
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json({ 
                error: error.message || 'Database error',
                details: error.details || null,
                hint: error.hint || null,
                code: error.code || null
            }, { status: 500 });
        }

        // Trigger readiness re-computation asynchronously (or await if we want immediate consistency)
        await recomputeLaunchReadiness(params.id);

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error updating criterion status:', error);
        return NextResponse.json({ 
            error: error?.message || 'Failed to update status',
            details: error?.details || null
        }, { status: 500 });
    }
}
