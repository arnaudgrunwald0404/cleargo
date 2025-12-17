import { NextRequest, NextResponse } from 'next/server';
import { getEpic } from '@/lib/aha/client';
import { verifyWebhookSignature } from '@/lib/aha/webhook-validator';
import { mapEpicToEpic } from '@/lib/aha/mapping';
import {
  upsertEpicFromAha,
  getUserByEmail,
  getFallbackProductOpsUser,
  getEpicByAhaId,
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
      epic_id: payload.epic?.id,
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
      console.log(
        `🔄 Fetching full epic details for ${epicId} to ensure all custom fields are loaded...`
      );
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

    // Get the Aha reference number to check if epic exists in our DB
    const ahaId = epic.reference_num || epic.id;

    // Only process epics that have been imported into ClearGO
    const existingEpic = await getEpicByAhaId(ahaId);
    if (!existingEpic) {
      console.log('⏭️  Skipping: Epic not imported into ClearGO', { aha_id: ahaId });
      return NextResponse.json(
        { message: 'Epic not imported into ClearGO, skipping' },
        { status: 200 }
      );
    }

    console.log('✅ Epic exists in ClearGO, processing update...');

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
      fields_to_load: fieldsToLoad,
    });

    // Resolve owner - keep existing owner if new owner not found
    let ownerId: string | null = existingEpic.owner_id;
    if (epicData.owner_email) {
      const user = await getUserByEmail(epicData.owner_email);
      if (user) {
        ownerId = user.id;
      }
      // If owner not found in ClearGO, keep the existing owner
    }

    // Update the epic
    const savedEpic = await upsertEpicFromAha(epicData, ownerId);
    console.log('🔄 Epic updated:', {
      epic_id: savedEpic.id,
      aha_id: savedEpic.aha_id,
      name: savedEpic.name,
      tier: savedEpic.tier,
    });

    return NextResponse.json(
      {
        message: 'Epic updated',
        epic_id: savedEpic.id,
        aha_id: savedEpic.aha_id,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
