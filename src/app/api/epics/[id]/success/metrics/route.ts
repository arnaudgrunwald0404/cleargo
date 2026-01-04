import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getEpic } from '@/lib/epics';
import {
  getEpicSuccessMetrics,
  addEpicSuccessMetric,
} from '@/lib/services/successMeasurementService';
import { createEpicSuccessMetricSchema } from '@/lib/success/validation';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metrics = await getEpicSuccessMetrics(epicId);
    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('Error fetching epic success metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch success metrics', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
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

    // Check if config exists and is locked
    const { getEpicSuccessConfig } = await import('@/lib/services/successMeasurementService');
    const config = await getEpicSuccessConfig(epicId);
    if (config?.locked && !isAdmin) {
      return NextResponse.json({ error: 'Configuration is locked. Only admins can modify locked configurations.' }, { status: 403 });
    }

    // Validate request body
    const body = await req.json();
    const parsed = createEpicSuccessMetricSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Validate metric exists
    const { getMetricById } = await import('@/lib/services/successMeasurementService');
    const metric = await getMetricById(parsed.data.metric_id);
    if (!metric) {
      return NextResponse.json({ error: 'Metric not found' }, { status: 404 });
    }

    const mapping = await addEpicSuccessMetric(epicId, parsed.data);
    return NextResponse.json(mapping, { status: 201 });
  } catch (error: any) {
    console.error('Error adding epic success metric:', error);
    if (error.message?.includes('maximum') || error.message?.includes('already added')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to add success metric', details: error.message },
      { status: 500 }
    );
  }
}

