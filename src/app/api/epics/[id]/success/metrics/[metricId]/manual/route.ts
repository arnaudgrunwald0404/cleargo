import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getEpic } from '@/lib/epics';
import {
  storeManualMetricValue,
  getManualMetricValues,
  deleteManualMetricValue,
} from '@/lib/services/metricValueService';
import { z } from 'zod';

const storeManualValueSchema = z.object({
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  value: z.union([z.number(), z.boolean()]),
});

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { id: epicId, metricId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0];

    const values = await getManualMetricValues(epicId, metricId, startDate, endDate);
    return NextResponse.json(values);
  } catch (error: any) {
    console.error('Error fetching manual metric values:', error);
    return NextResponse.json(
      { error: 'Failed to fetch manual metric values', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { id: epicId, metricId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const parsed = storeManualValueSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await storeManualMetricValue(
      epicId,
      metricId,
      parsed.data.snapshot_date,
      parsed.data.value,
      me!.id
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    console.error('Error storing manual metric value:', error);
    return NextResponse.json(
      { error: 'Failed to store manual metric value', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { id: epicId, metricId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions - Admin only for delete
    const role = await resolveRole(user.email);
    const isAdmin = role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO';

    if (!isAdmin) {
      return forbid();
    }

    const { searchParams } = new URL(req.url);
    const snapshotDate = searchParams.get('snapshot_date');
    if (!snapshotDate) {
      return NextResponse.json({ error: 'snapshot_date query parameter is required' }, { status: 400 });
    }

    await deleteManualMetricValue(epicId, metricId, snapshotDate);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting manual metric value:', error);
    return NextResponse.json(
      { error: 'Failed to delete manual metric value', details: error.message },
      { status: 500 }
    );
  }
}

