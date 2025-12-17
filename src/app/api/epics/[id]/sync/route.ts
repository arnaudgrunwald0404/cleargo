import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAhaClient } from '@/lib/aha/client';
import { mapEpicToEpic } from '@/lib/aha/mapping';
import { getSettings } from '@/lib/settings-db';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Use service role key for database operations
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Sync a single epic from Aha by its database ID
 * 
 * POST /api/epics/[id]/sync
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the epic from database to find its aha_id
        const adminSupabase = createSupabaseAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            supabaseServiceKey!
        );

        const { data: existingEpic, error: fetchError } = await adminSupabase
            .from('epic')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !existingEpic) {
            return NextResponse.json(
                { error: 'Epic not found' },
                { status: 404 }
            );
        }

        if (!existingEpic.aha_id) {
            return NextResponse.json(
                { error: 'This epic does not have an Aha ID and cannot be synced' },
                { status: 400 }
            );
        }

        console.log(`🔄 Syncing epic ${existingEpic.aha_id} from Aha (requested by ${user.email})`);

        const client = getAhaClient();
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

        // Fetch the epic from Aha
        let ahaEpic;
        try {
            ahaEpic = await client.getEpic(existingEpic.aha_id);
        } catch (fetchError: any) {
            console.error(`Failed to fetch epic ${existingEpic.aha_id} from Aha:`, fetchError);
            if (fetchError.message?.includes('404') || fetchError.message?.includes('not found')) {
                return NextResponse.json(
                    { error: `Epic "${existingEpic.aha_id}" not found in Aha. It may have been deleted.` },
                    { status: 404 }
                );
            }
            return NextResponse.json(
                { error: `Failed to fetch epic from Aha: ${fetchError.message}` },
                { status: 500 }
            );
        }

        // Map Aha epic to our schema
        const epicData = await mapEpicToEpic(ahaEpic, fieldsToLoad);

        // Resolve owner
        let ownerId: string | null = existingEpic.owner_id;
        if (epicData.owner_email) {
            const { data: ownerUser } = await adminSupabase
                .from('app_user')
                .select('id')
                .eq('email', epicData.owner_email)
                .single();
            
            if (ownerUser) {
                ownerId = ownerUser.id;
            }
        }

        // Update the epic with fresh data from Aha
        const updateData: any = {
            aha_url: epicData.aha_url,
            name: epicData.name,
            tier: epicData.tier,
            target_launch_date: epicData.target_launch_date,
            scheduled_ga_dev_date: epicData.scheduled_ga_dev_date,
            owner_email: epicData.owner_email,
            owner_id: ownerId,
            product_component: epicData.product_component,
            pod: epicData.pod,
            business_priority: epicData.business_priority,
            csm_priority: epicData.csm_priority,
            tags: epicData.tags,
            modified_rice_score: epicData.modified_rice_score,
            wsjf_score: epicData.wsjf_score,
            gtm_link: epicData.gtm_link,
            activation_process: epicData.activation_process,
            new_org_setup: epicData.new_org_setup,
            existing_org_setup: epicData.existing_org_setup,
            pricing_model: epicData.pricing_model,
            aha_fields: epicData.aha_fields,
            updated_at: new Date().toISOString(),
        };

        const { data: updatedEpic, error: updateError } = await adminSupabase
            .from('epic')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating epic:', updateError);
            return NextResponse.json(
                { error: `Failed to update epic: ${updateError.message}` },
                { status: 500 }
            );
        }

        console.log(`✅ Successfully synced epic: ${updatedEpic.name} (${updatedEpic.aha_id})`);

        return NextResponse.json({
            success: true,
            message: `Epic "${updatedEpic.name}" synced successfully`,
            epic: updatedEpic,
        });

    } catch (error) {
        console.error('Epic sync error:', error);
        return NextResponse.json(
            { error: 'Sync failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}

