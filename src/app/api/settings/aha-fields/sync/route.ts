import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/aha/client';
import { mapEpicToEpic } from '@/lib/aha/mapping';
import { upsertEpicFromAha, getUserByEmail, getFallbackProductOpsUser } from '@/lib/db/epics';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        // Check authentication
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: settings.ahaFields.sync
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }
        
        const { canRolesPerform } = await import('@/lib/permissions');
        const ok = await canRolesPerform((me?.roles as string[]) || [], 'settings.ahaFields.sync');
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // Get current settings to determine which fields to load
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

        // Fetch all epics that have an aha_id
        const { data: epics, error: epicsError } = await supabase
            .from('epic')
            .select('id, aha_id, name')
            .not('aha_id', 'is', null);

        if (epicsError) {
            throw new Error(`Failed to fetch epics: ${epicsError.message}`);
        }

        if (!epics || epics.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No epics found to synchronize',
                synced: 0,
                failed: 0,
                total: 0,
            });
        }

        let synced = 0;
        let failed = 0;
        const errors: Array<{ aha_id: string; name: string; error: string }> = [];

        // Process each epic
        for (const epicRecord of epics) {
            if (!epicRecord.aha_id) continue;

            try {
                // Fetch epic from AHA
                const epic = await getEpic(epicRecord.aha_id);
                
                // Map epic to epic data with current fieldsToLoad
                const epicData = await mapEpicToEpic(epic, fieldsToLoad);
                
                // Resolve owner
                let ownerId: string | null = null;
                if (epicData.owner_email) {
                    const user = await getUserByEmail(epicData.owner_email);
                    if (user) {
                        ownerId = user.id;
                    } else {
                        ownerId = await getFallbackProductOpsUser();
                    }
                } else {
                    ownerId = await getFallbackProductOpsUser();
                }
                
                // Update epic with new aha_fields
                await upsertEpicFromAha(epicData, ownerId);
                synced++;
            } catch (error: any) {
                console.error(`Failed to sync epic ${epicRecord.aha_id}:`, error);
                failed++;
                errors.push({
                    aha_id: epicRecord.aha_id,
                    name: epicRecord.name,
                    error: error.message || 'Unknown error',
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Synchronized ${synced} epic${synced !== 1 ? 's' : ''}`,
            synced,
            failed,
            total: epics.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Error synchronizing AHA fields:', error);
        return NextResponse.json(
            { error: 'Failed to synchronize AHA fields', details: error.message },
            { status: 500 }
        );
    }
}



