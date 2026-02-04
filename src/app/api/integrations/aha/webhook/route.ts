import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/aha/client';
import type { AhaWebhookPayload } from '@/lib/aha/types';
import { verifyWebhookSignature } from '@/lib/aha/webhook-validator';
import { mapEpicToEpic, shouldProcessEpic } from '@/lib/aha/mapping';
import {
    upsertEpicFromAha,
    getUserByEmail,
    getFallbackProductOpsUser,
    instantiateCriteriaForEpic,
    getEpicByAhaId,
    fetchAndUpsertReleaseFromAha,
    clearAhaRecordNotFound,
} from '@/lib/db/epics';
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
        // Skip fetch for test epics (they won't exist in Aha)
        const isTestEpic = epicId && (epicId.startsWith('TEST-') || epicId.includes('TEST-WEBHOOK'));
        if (epicId && !isTestEpic) {
            console.log(`🔄 Fetching full epic details for ${epicId} to ensure all custom fields are loaded...`);
            try {
                epic = await getEpic(epicId);
                console.log('✅ Fetched full epic details with custom fields');
            } catch (error) {
                console.error('Failed to fetch epic details:', error);
                const err = error as Error;
                if (err?.message?.includes('404') || err?.message?.toLowerCase().includes('record not found')) {
                    const { setAhaRecordNotFoundByAhaId } = await import('@/lib/db/epics');
                    await setAhaRecordNotFoundByAhaId(epicId);
                }
                // If we have epic from payload, use it as fallback
                if (!epic) {
                    return NextResponse.json({ 
                        error: 'Failed to fetch epic details', 
                        details: err?.message ?? String(error)
                    }, { status: 500 });
                }
                console.warn('Using epic from payload (may be missing some custom fields)');
            }
        } else if (isTestEpic) {
            console.log('🧪 Test epic detected, skipping Aha fetch and using payload data');
        }

        // Only process epic events
        if (!epic) {
            console.log('⏭️  Skipping: Not an epic event');
            return NextResponse.json({ message: 'Not an epic event, skipping' }, { status: 200 });
        }

        // Apply filter: only process if ClearGO Candidate = Yes or has LaunchConsole tag
        if (!(await shouldProcessEpic(epic))) {
            console.log('⏭️  Skipping: Epic does not match filter criteria', {
                epic_id: epic.id,
                tags: epic.tags,
                cleargo_candidate: Array.isArray(epic.custom_fields) 
                    ? epic.custom_fields.find((f: any) => f?.key === 'cleargo_candidate')?.value 
                    : null
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

        // Map Aha epic to epic data with configured fields
        const epicData = await mapEpicToEpic(epic, fieldsToLoad);
        
        // Log pod field and AHA fields to verify they're being loaded
        console.log('📦 Fields loaded:', {
            pod: epicData.pod,
            has_aha_fields: !!epicData.aha_fields,
            aha_fields: epicData.aha_fields,
            fields_to_load: fieldsToLoad
        });

        // Auto-fetch release from Aha API if it doesn't exist in system
        if (epicData.aha_release_name) {
            const supabase = createClient();
            const { data: existingRelease } = await supabase
                .from('release_schedule')
                .select('release_name')
                .eq('release_name', epicData.aha_release_name)
                .maybeSingle();
            
            if (!existingRelease) {
                try {
                    await fetchAndUpsertReleaseFromAha(epicData.aha_release_name);
                } catch (fetchError) {
                    // Log error but continue processing epic
                    console.warn(`Failed to auto-fetch release "${epicData.aha_release_name}" from Aha:`, fetchError);
                }
            }
        }

        // Resolve owner
        let ownerId: string | null = null;
        if (epicData.owner_email) {
            const user = await getUserByEmail(epicData.owner_email);
            if (user) {
                ownerId = user.id;
            } else {
                // Fallback to Product Ops user
                console.warn(`Owner not found: ${epicData.owner_email}, trying fallback`);
                try {
                    ownerId = await getFallbackProductOpsUser();
                } catch (fallbackError) {
                    console.warn('Fallback user not found, proceeding without owner:', fallbackError);
                    ownerId = null;
                }
            }
        } else {
            // No owner specified, try fallback
            try {
                ownerId = await getFallbackProductOpsUser();
            } catch (fallbackError) {
                console.warn('Fallback user not found, proceeding without owner:', fallbackError);
                ownerId = null;
            }
        }

        // Check if this is a new epic
        const existingEpic = await getEpicByAhaId(epicData.aha_id);
        const isNewEpic = !existingEpic;

        // Upsert epic
        const savedEpic = await upsertEpicFromAha(epicData, ownerId);
        await clearAhaRecordNotFound(savedEpic.id);
        console.log(`${isNewEpic ? '🆕' : '🔄'} Epic ${isNewEpic ? 'created' : 'updated'}:`, {
            epic_id: savedEpic.id,
            aha_id: savedEpic.aha_id,
            name: savedEpic.name,
            tier: savedEpic.tier
        });

        // For new epics, instantiate criteria
        if (isNewEpic) {
            await instantiateCriteriaForEpic(savedEpic.id, savedEpic.tier);
            console.log('✅ Criteria instantiated for new epic');
        }

        return NextResponse.json({
            message: isNewEpic ? 'Epic created' : 'Epic updated',
            epic_id: savedEpic.id,
            aha_id: savedEpic.aha_id,
        }, { status: 200 });

    } catch (error) {
        console.error('Webhook processing error:', error);
        const errorMessage = error instanceof Error 
            ? error.message 
            : typeof error === 'string' 
                ? error 
                : JSON.stringify(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error('Error details:', { message: errorMessage, stack: errorStack });
        return NextResponse.json(
            { 
                error: 'Internal server error', 
                details: errorMessage,
                ...(errorStack && { stack: errorStack })
            },
            { status: 500 }
        );
    }
}
