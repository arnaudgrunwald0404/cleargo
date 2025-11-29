import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/aha/client';
import { mapEpicToLaunch } from '@/lib/aha/mapping';
import { upsertLaunchFromAha, getUserByEmail, getFallbackProductOpsUser } from '@/lib/db/launches';
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

        // Get current settings to determine which fields to load
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

        // Fetch all launches that have an aha_id
        const { data: launches, error: launchesError } = await supabase
            .from('launch')
            .select('id, aha_id, name')
            .not('aha_id', 'is', null);

        if (launchesError) {
            throw new Error(`Failed to fetch launches: ${launchesError.message}`);
        }

        if (!launches || launches.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No launches found to synchronize',
                synced: 0,
                failed: 0,
                total: 0,
            });
        }

        let synced = 0;
        let failed = 0;
        const errors: Array<{ aha_id: string; name: string; error: string }> = [];

        // Process each launch
        for (const launch of launches) {
            if (!launch.aha_id) continue;

            try {
                // Fetch epic from AHA
                const epic = await getEpic(launch.aha_id);
                
                // Map epic to launch data with current fieldsToLoad
                const launchData = await mapEpicToLaunch(epic, fieldsToLoad);

                // Resolve owner
                let ownerId: string | null = null;
                if (launchData.owner_email) {
                    const user = await getUserByEmail(launchData.owner_email);
                    if (user) {
                        ownerId = user.id;
                    } else {
                        ownerId = await getFallbackProductOpsUser();
                    }
                } else {
                    ownerId = await getFallbackProductOpsUser();
                }

                // Update launch with new aha_fields
                await upsertLaunchFromAha(launchData, ownerId);
                synced++;
            } catch (error: any) {
                console.error(`Failed to sync launch ${launch.aha_id}:`, error);
                failed++;
                errors.push({
                    aha_id: launch.aha_id,
                    name: launch.name,
                    error: error.message || 'Unknown error',
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Synchronized ${synced} launch${synced !== 1 ? 'es' : ''}`,
            synced,
            failed,
            total: launches.length,
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

