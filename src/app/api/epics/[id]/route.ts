import { NextRequest, NextResponse } from 'next/server';
import { getEpic, updateEpic, deleteEpic } from '@/lib/epics';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEpic as getAhaEpic } from '@/lib/aha/client';
import { mapEpicToEpic } from '@/lib/aha/mapping';
import { upsertEpicFromAha, getUserByEmail, getFallbackProductOpsUser } from '@/lib/db/epics';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        let epic = await getEpic(id);
        if (!epic) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }

        if (epic.aha_id) {
            try {
                const settings = await getSettings();
                const fieldsToLoad = settings.aha_fields_to_load || [];
                const ahaEpic = await getAhaEpic(epic.aha_id);
                const epicData = await mapEpicToEpic(ahaEpic, fieldsToLoad);
                let ownerId: string | null = null;
                if (epicData.owner_email) {
                    const user = await getUserByEmail(epicData.owner_email);
                    ownerId = user ? user.id : await getFallbackProductOpsUser();
                } else {
                    ownerId = await getFallbackProductOpsUser();
                }
                await upsertEpicFromAha(epicData, ownerId);
                epic = await getEpic(id) ?? epic;
            } catch (syncError: any) {
                // 404 means the epic no longer exists in Aha — just serve local data
                if (syncError?.status === 404 || syncError?.message?.includes('error 404')) {
                    console.info(`Aha sync skipped for epic ${id}: aha_id ${epic.aha_id} no longer exists in Aha`);
                } else {
                    console.warn(`Aha sync for epic ${id} (aha_id: ${epic.aha_id}):`, syncError?.message ?? syncError);
                }
            }
        }

        return NextResponse.json(epic);
    } catch (error: any) {
        console.error('Error fetching epic:', error);
        if (error?.code === 'PGRST116' || error?.message?.includes('No rows')) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to fetch epic' }, { status: 500 });
    }
}

export async function PATCH(
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

        const body = await req.json();

        // Load current epic to compare changes
        const current = await getEpic(id);
        if (!current) {
            return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
        }

        // Load caller roles
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
            .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }
        
        const roles = (me?.roles as string[]) || [];
        const rules = await getEffectivePermissionRules();

        // Check permission for status updates
        // Only allow status = 'Cancelled' for non-admins; admins/CPOs can set any status
        const updates = { ...body };
        if (updates.status !== undefined) {
            if (updates.status !== 'Cancelled') {
                // Check if user has permission to update status (admins/CPOs only)
                const canUpdateStatus = canRolesPerformWithRules(roles, 'launch.status.update', rules);
                if (!canUpdateStatus) {
                    // Remove status from updates - only allow "Cancelled" for non-admins
                    delete updates.status;
                }
            }
        }

        if (typeof body.tier !== 'undefined' && body.tier !== current.tier) {
            const ok = canRolesPerformWithRules(roles, 'launch.tier.update', rules);
            if (!ok) return NextResponse.json({ error: 'Forbidden: cannot update epic tier' }, { status: 403 });
        }
        if (typeof body.risk_level !== 'undefined' && body.risk_level !== current.risk_level) {
            const ok = canRolesPerformWithRules(roles, 'launch.risk.update', rules);
            if (!ok) return NextResponse.json({ error: 'Forbidden: cannot update epic risk level' }, { status: 403 });
        }

        await updateEpic(id, updates);

        const needsDueDateRecalc =
            typeof body.target_launch_date !== 'undefined' || typeof body.aha_fields !== 'undefined';
        if (needsDueDateRecalc) {
            try {
                const { recalculateDueDatesForEpic } = await import('@/lib/db/epics');
                await recalculateDueDatesForEpic(id);
            } catch (e) {
                console.error(`Failed to recalculate criterion due dates after epic PATCH ${id}:`, e);
            }
        }

        // Auto-lock success config if readiness_status changed to GO
        if (typeof body.readiness_status !== 'undefined' && body.readiness_status === 'GO' && current.readiness_status !== 'GO') {
            try {
                const { lockEpicSuccessConfig, getEpicSuccessConfig } = await import('@/lib/services/successMeasurementService');
                const config = await getEpicSuccessConfig(id);
                
                // Only lock if config exists and is not already locked
                if (config && !config.locked) {
                    await lockEpicSuccessConfig(id);
                    console.log(`Auto-locked success config for epic ${id} (status changed to GO)`);
                }
            } catch (error) {
                console.error('Auto-lock failed:', error);
                // Don't fail the update if auto-lock fails
            }
        }

        const epic = await getEpic(id);
        if (epic?.aha_id) {
            try {
                const { writeBackEpicReadiness } = await import('@/lib/aha/write-back');
                await writeBackEpicReadiness(epic.id);
                console.log(`Write-back triggered for epic ${epic.id}`);
            } catch (error) {
                console.error('Write-back failed:', error);
            }
        }
        return NextResponse.json(epic ?? {});
    } catch (error) {
        console.error('Error updating epic:', error);
        return NextResponse.json({ error: 'Failed to update epic' }, { status: 500 });
    }
}

export async function DELETE(
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

        // Check capability to delete epic
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
            .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }
        
        const roles = (me?.roles as string[]) || [];
        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules(roles, 'launch.delete', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden: cannot delete epic' }, { status: 403 });

        await deleteEpic(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting epic:', error);
        return NextResponse.json({ error: 'Failed to delete epic' }, { status: 500 });
    }
}
