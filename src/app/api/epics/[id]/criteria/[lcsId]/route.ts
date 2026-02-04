import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeEpicReadiness } from '@/lib/readiness';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { isEnabled, FEATURE_NOT_APPLICABLE } from '@/lib/flags';
import { getFeatureFlags } from '@/lib/settings-db';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
    // #region agent log
    const fs = require('fs');
    const logEntry = {location:'route.ts:5',message:'PATCH request received',data:{paramsResolved:false},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,E',runId:'status-update'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry) + '\n'); } catch(e) {}
    // #endregion
    
    try {
        const { id, lcsId } = await params;
        
        // #region agent log
        const logEntry2 = {location:'route.ts:11',message:'Params resolved',data:{id,lcsId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,E',runId:'status-update'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry2) + '\n'); } catch(e) {}
        // #endregion
        
        const supabase = createClient();
        const userEmail = await getAuthenticatedUserEmail();

        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get app_user ID from email
        const { data: appUser, error: userError } = await supabase
            .from('app_user')
            .select('id')
            .eq('email', userEmail)
            .single();

        if (userError || !appUser) {
            console.error('Failed to find app_user:', userError);
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        const body = await req.json();
        const { status, notes, condition, condition_due_date, data_source_values } = body;

        // Load current user's roles
        const { data: me } = await supabase
            .from('app_user')
            .select('roles')
            .eq('id', appUser.id)
            .single();

        // Check permission to update criterion status in general
        {
            const { canRolesPerform } = await import('@/lib/permissions');
            const canUpdate = await canRolesPerform((me?.roles as string[]) || [], 'criteria.status.update');
            if (!canUpdate) {
                return NextResponse.json({ error: 'Forbidden: cannot update criterion score' }, { status: 403 });
            }
        }

        const isNotApplicableStatus = typeof status === 'string' && (
            status === 'NOT_APPLICABLE' ||
            status === 'NA' ||
            status.toUpperCase().trim() === 'N/A'
        );

        if (isNotApplicableStatus) {
            const featureFlags = await getFeatureFlags();
            if (!isEnabled(FEATURE_NOT_APPLICABLE, featureFlags)) {
                return NextResponse.json(
                    { error: 'Not Applicable Go/No-Go score is not enabled' },
                    { status: 400 }
                );
            }
            const { data: row } = await supabase
                .from('epic_criterion_status')
                .select('criterion_id, criterion:criterion_id(gate)')
                .eq('id', lcsId)
                .eq('epic_id', id)
                .single();
            const criterion = (row as any)?.criterion;
            if (criterion?.gate === true) {
                return NextResponse.json(
                    { error: 'Gating Go/No-Go score cannot be Not Applicable' },
                    { status: 400 }
                );
            }
        }

        console.log('Updating criterion status:', { 
            lcsId, 
            epicId: id, 
            status,
            appUserId: appUser.id,
            body 
        });

        // Build update object, only including defined values
        const updateData: any = {
            last_updated_at: new Date().toISOString(),
            last_updated_by: appUser.id
        };
        
        if (typeof status !== 'undefined') {
            updateData.status = isNotApplicableStatus ? 'NOT_APPLICABLE' : status;
        }
        if (typeof notes !== 'undefined') updateData.current_status_notes = notes;
        if (typeof condition !== 'undefined') updateData.condition = condition;
        if (typeof condition_due_date !== 'undefined') updateData.condition_due_date = condition_due_date;
        if (typeof data_source_values !== 'undefined') updateData.data_source_values = data_source_values;

        // Update the status
        const { data, error } = await supabase
            .from('epic_criterion_status')
            .update(updateData)
            .eq('id', lcsId)
            .eq('epic_id', id) // Security check
            .select('*, data_source_values')
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
        // #region agent log
        const logEntry6 = {location:'route.ts:100',message:'Supabase update succeeded',data:{returnedDataKeys:data ? Object.keys(data) : [],returnedDataSourceValues:data?.data_source_values},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G',runId:'run1'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry6) + '\n'); } catch(e) {}
        // #endregion

        // Trigger readiness re-computation asynchronously (or await if we want immediate consistency)
        await recomputeEpicReadiness(id, appUser.id);

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error updating criterion status:', error);
        return NextResponse.json({ 
            error: error?.message || 'Failed to update status',
            details: error?.details || null
        }, { status: 500 });
    }
}