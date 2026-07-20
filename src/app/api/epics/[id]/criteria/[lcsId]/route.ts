import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recomputeEpicReadiness } from '@/lib/readiness';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { isEnabled, FEATURE_NOT_APPLICABLE } from '@/lib/flags';
import { getFeatureFlags, getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { trackActivityFromAction } from '@/lib/services/userActivityService';
import { logStatusChange } from '@/lib/db/criterion-status-history';
import { maybeNotifyGateOwnerForCategory } from '@/lib/services/gateSignoffService';
import { maybeNotifyMasterApproversWhenGatesComplete } from '@/lib/services/masterApprovalService';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; lcsId: string }> }
) {
    try {
        const { id, lcsId } = await params;
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
            const rules = await getEffectivePermissionRules();
            const canUpdate = canRolesPerformWithRules((me?.roles as string[]) || [], 'criteria.status.update', rules);
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

        let previousStatus: string | undefined;
        if (typeof status !== 'undefined') {
            const { data: current } = await supabase
                .from('epic_criterion_status')
                .select('status')
                .eq('id', lcsId)
                .eq('epic_id', id)
                .single();
            previousStatus = current?.status;
        }

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

        if (typeof status !== 'undefined' && data?.status != null && data.status !== previousStatus) {
            await supabase.from('audit_log').insert({
                actor_id: appUser.id,
                entity_type: 'epic_criterion_status',
                entity_id: lcsId,
                json_diff: { status: { old: previousStatus ?? null, new: data.status } },
            });

            logStatusChange({
                epicCriterionStatusId: lcsId,
                epicId: id,
                criterionId: data.criterion_id,
                oldStatus: previousStatus ?? null,
                newStatus: data.status,
                changedBy: appUser.id,
            });

            trackActivityFromAction(appUser.id).catch(err => {
                console.error('[PATCH /api/epics/[id]/criteria/[lcsId]] Failed to track activity:', err);
            });
        }

        // Check whether all non-gate sub-criteria in the same category are now
        // rated, and if so notify the gate criterion owner to sign off.
        if (typeof status !== 'undefined') {
            maybeNotifyGateOwnerForCategory(id, lcsId, supabase).catch(err => {
                console.error(`[PATCH /api/epics/${id}/criteria/${lcsId}] Gate signoff check failed:`, err?.message ?? err);
            });
            // I-9: if this was a gate sign-off and every gate is now decided,
            // notify the final master approver(s).
            maybeNotifyMasterApproversWhenGatesComplete(id, lcsId, supabase).catch(err => {
                console.error(`[PATCH /api/epics/${id}/criteria/${lcsId}] Master approval check failed:`, err?.message ?? err);
            });
        }

        // Trigger readiness re-computation asynchronously (or await if we want immediate consistency)
        try {
            await recomputeEpicReadiness(id, appUser.id);
        } catch (recalcError: any) {
            // Log error but don't fail the request - the status update succeeded
            console.error(`[PATCH /api/epics/${id}/criteria/${lcsId}] Failed to recompute readiness:`, {
                epicId: id,
                criterionStatusId: lcsId,
                error: recalcError?.message || 'Unknown error',
                stack: recalcError?.stack
            });
            // Continue - the criterion status was updated successfully
            // The readiness score will be recalculated on next status change or manual trigger
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error updating criterion status:', error);
        return NextResponse.json({ 
            error: error?.message || 'Failed to update status',
            details: error?.details || null
        }, { status: 500 });
    }
}