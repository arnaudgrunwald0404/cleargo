import { NextRequest, NextResponse } from 'next/server';
import { getEpic } from '@/lib/aha/client';
import type { AhaWebhookPayload } from '@/lib/aha/types';
import { verifyWebhookSignature } from '@/lib/aha/webhook-validator';
import { mapEpicToLaunch, shouldProcessEpic } from '@/lib/aha/mapping';
import {
    upsertLaunchFromAha,
    getUserByEmail,
    getFallbackProductOpsUser,
    instantiateCriteriaForLaunch,
    getLaunchByAhaId,
} from '@/lib/db/launches';
import { getSettings } from '@/lib/settings-db';

export async function POST(req: NextRequest) {
    try {
        // Get raw body for signature verification
        const rawBody = await req.text();
        const signature = req.headers.get('x-aha-signature') || req.headers.get('x-hub-signature-256');

        // Verify webhook signature (optional - skip if no signature provided)
        if (signature) {
            const isValid = await verifyWebhookSignature(rawBody, signature);
            if (!isValid) {
                console.error('Invalid webhook signature');
                return new NextResponse('Unauthorized', { status: 401 });
            }
        } else {
            console.log('No webhook signature provided - skipping verification');
        }

        // Parse payload
        const payload: any = JSON.parse(rawBody);
        console.log('📥 Webhook received:', {
            event: payload.event,
            audit_type: payload.audit?.auditable_type,
            audit_id: payload.audit?.auditable_id,
            epic_id: payload.epic?.id
        });

        let epic = payload.epic;
        let epicId: string | null = null;

        // Determine epic ID from payload
        if (epic?.id) {
            epicId = epic.id;
        } else if (epic?.reference_num) {
            epicId = epic.reference_num;
        } else if (payload.audit?.auditable_type === 'epic') {
            epicId = payload.audit.auditable_id;
        } else if (payload.audit?.associated_type === 'epic') {
            epicId = payload.audit.associated_id;
        }

        // Always fetch full epic details to ensure custom_fields (including pod) are loaded
        if (epicId) {
            console.log(`🔄 Fetching full epic details for ${epicId} to ensure all custom fields are loaded...`);
            try {
                epic = await getEpic(epicId);
                console.log('✅ Fetched full epic details with custom fields');
            } catch (error) {
                console.error('Failed to fetch epic details:', error);
                // If we have epic from payload, use it as fallback
                if (!epic) {
                    return NextResponse.json({ error: 'Failed to fetch epic details' }, { status: 500 });
                }
                console.warn('Using epic from payload (may be missing some custom fields)');
            }
        }

        // Only process epic events
        if (!epic) {
            console.log('⏭️  Skipping: Not an epic event');
            return NextResponse.json({ message: 'Not an epic event, skipping' }, { status: 200 });
        }

        // Apply filter: only process if launch candidate or has LaunchConsole tag
        if (!shouldProcessEpic(epic)) {
            console.log('⏭️  Skipping: Epic does not match filter criteria', {
                epic_id: epic.id,
                tags: epic.tags,
                launch_candidate: epic.custom_fields?.launch_candidate?.value
            });
            return NextResponse.json(
                { message: 'Epic does not match filter criteria, skipping' },
                { status: 200 }
            );
        }

        console.log('✅ Epic matches filter criteria, processing...');

        // Get settings to determine which fields to load
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

        // Map Aha epic to launch data with configured fields
        const launchData = await mapEpicToLaunch(epic, fieldsToLoad);
        
        // Log pod field and AHA fields to verify they're being loaded
        console.log('📦 Fields loaded:', {
            pod: launchData.pod,
            has_aha_fields: !!launchData.aha_fields,
            aha_fields: launchData.aha_fields,
            fields_to_load: fieldsToLoad
        });

        // Resolve owner
        let ownerId: string | null = null;
        if (launchData.owner_email) {
            const user = await getUserByEmail(launchData.owner_email);
            if (user) {
                ownerId = user.id;
            } else {
                // Fallback to Product Ops user
                console.warn(`Owner not found: ${launchData.owner_email}, using fallback`);
                ownerId = await getFallbackProductOpsUser();
            }
        } else {
            // No owner specified, use fallback
            ownerId = await getFallbackProductOpsUser();
        }

        // Check if this is a new launch
        const existingLaunch = await getLaunchByAhaId(launchData.aha_id);
        const isNewLaunch = !existingLaunch;

        // Upsert launch
        const launch = await upsertLaunchFromAha(launchData, ownerId);
        console.log(`${isNewLaunch ? '🆕' : '🔄'} Launch ${isNewLaunch ? 'created' : 'updated'}:`, {
            launch_id: launch.id,
            aha_id: launch.aha_id,
            name: launch.name,
            tier: launch.tier
        });

        // For new launches, instantiate criteria
        if (isNewLaunch) {
            await instantiateCriteriaForLaunch(launch.id, launch.tier);
            console.log('✅ Criteria instantiated for new launch');
        }

        return NextResponse.json({
            message: isNewLaunch ? 'Launch created' : 'Launch updated',
            launch_id: launch.id,
            aha_id: launch.aha_id,
        }, { status: 200 });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: (error as Error).message },
            { status: 500 }
        );
    }
}
