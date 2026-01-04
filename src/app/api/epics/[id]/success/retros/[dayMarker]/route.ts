import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getEpic } from '@/lib/epics';
import {
  getEpicRetroByDayMarker,
  updateEpicRetro,
} from '@/lib/services/successMeasurementService';
import { updateEpicRetroSchema } from '@/lib/success/validation';
import type { DayMarker, SubmitEpicRetroDTO } from '@/lib/success/types';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayMarker: string }> }
) {
  try {
    const { id: epicId, dayMarker } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dayMarkerNum = parseInt(dayMarker, 10);
    if (![30, 60, 90].includes(dayMarkerNum)) {
      return NextResponse.json({ error: 'Invalid day marker. Must be 30, 60, or 90' }, { status: 400 });
    }

    const retro = await getEpicRetroByDayMarker(epicId, dayMarkerNum as DayMarker);
    if (!retro) {
      return NextResponse.json({ error: 'Retro not found' }, { status: 404 });
    }

    return NextResponse.json(retro);
  } catch (error: any) {
    console.error('Error fetching epic retro:', error);
    return NextResponse.json(
      { error: 'Failed to fetch retro', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayMarker: string }> }
) {
  try {
    const { id: epicId, dayMarker } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dayMarkerNum = parseInt(dayMarker, 10);
    if (![30, 60, 90].includes(dayMarkerNum)) {
      return NextResponse.json({ error: 'Invalid day marker. Must be 30, 60, or 90' }, { status: 400 });
    }

    // Check if epic exists
    const epic = await getEpic(epicId);
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    // Check permissions - PM or admin
    const role = await resolveRole(user.email);
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles, id')
      .eq('email', user.email)
      .single();

    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }

    const userRoles = (me?.roles as string[]) || [];
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';
    const isPM = userRoles.includes('PM');
    const isEpicOwner = epic.owner_id === me?.id;

    if (!isAdmin && !(isPM && isEpicOwner)) {
      return forbid();
    }

    // Validate request body
    const body = await req.json();
    const parsed = updateEpicRetroSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Convert null values to undefined for compatibility
    const updateData: Partial<SubmitEpicRetroDTO> = {
      ...parsed.data,
      blockers: parsed.data.blockers === null ? undefined : parsed.data.blockers,
      assumptions_wrong: parsed.data.assumptions_wrong === null ? undefined : parsed.data.assumptions_wrong,
      repeat_next_time: parsed.data.repeat_next_time === null ? undefined : parsed.data.repeat_next_time,
      change_next_time: parsed.data.change_next_time === null ? undefined : parsed.data.change_next_time,
      action_items: parsed.data.action_items === null ? undefined : parsed.data.action_items,
    };

    const retro = await updateEpicRetro(epicId, dayMarkerNum as DayMarker, updateData);
    return NextResponse.json(retro);
  } catch (error: any) {
    console.error('Error updating epic retro:', error);
    if (error.message?.includes('already been submitted')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to update retro', details: error.message },
      { status: 500 }
    );
  }
}

