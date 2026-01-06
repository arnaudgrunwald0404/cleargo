import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAhaClient } from '@/lib/aha/client';
import { mapEpicToEpic } from '@/lib/aha/mapping';
import {
  upsertEpicFromAha,
  getUserByEmail,
  getFallbackProductOpsUser,
  instantiateCriteriaForEpic,
  getEpicByAhaId,
} from '@/lib/db/epics';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

/**
 * Import a single epic from Aha by its reference number (e.g., "EPIC-123")
 *
 * POST body:
 * - aha_id: The Aha epic reference number (e.g., "EPIC-123" or just the ID)
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { aha_id } = body;

    if (!aha_id || typeof aha_id !== 'string' || !aha_id.trim()) {
      return NextResponse.json({ error: 'Aha ID is required (e.g., "EPIC-123")' }, { status: 400 });
    }

    const ahaId = aha_id.trim();
    console.log(`📥 Importing epic from Aha: ${ahaId} (requested by ${user.email})`);

    const client = getAhaClient();
    const settings = await getSettings();
    const fieldsToLoad = settings.aha_fields_to_load || [];

    // Fetch the epic from Aha
    let ahaEpic;
    try {
      ahaEpic = await client.getEpic(ahaId);
    } catch (fetchError: any) {
      console.error(`Failed to fetch epic ${ahaId} from Aha:`, fetchError);
      if (fetchError.message?.includes('404') || fetchError.message?.includes('not found')) {
        return NextResponse.json(
          { error: `Epic "${ahaId}" not found in Aha. Please check the ID and try again.` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Failed to fetch epic from Aha: ${fetchError.message}` },
        { status: 500 }
      );
    }

    // Check if epic already exists in our system
    const existingEpic = await getEpicByAhaId(ahaEpic.reference_num || ahaId);
    const isNewEpic = !existingEpic;

    if (!isNewEpic) {
      return NextResponse.json(
        {
          error: `Epic "${ahaEpic.reference_num || ahaId}" already exists in the system.`,
          existingEpicId: existingEpic.id,
        },
        { status: 409 }
      );
    }

    // Map Aha epic to our schema
    const epicData = await mapEpicToEpic(ahaEpic, fieldsToLoad);

    // Resolve owner
    let ownerId: string | null = null;
    if (epicData.owner_email) {
      const ownerUser = await getUserByEmail(epicData.owner_email);
      if (ownerUser) {
        ownerId = ownerUser.id;
      } else {
        ownerId = await getFallbackProductOpsUser();
      }
    } else {
      ownerId = await getFallbackProductOpsUser();
    }

    // Upsert epic
    const savedEpic = await upsertEpicFromAha(epicData, ownerId);

    // Instantiate criteria for new epics
    await instantiateCriteriaForEpic(savedEpic.id, savedEpic.tier);

    console.log(`✅ Successfully imported epic: ${savedEpic.name} (${savedEpic.aha_id})`);

    return NextResponse.json(
      {
        success: true,
        message: `Epic "${savedEpic.name}" imported successfully`,
        epic: savedEpic,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Epic import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}




