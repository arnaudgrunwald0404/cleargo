import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getMetricById, updateMetric, deleteMetric } from '@/lib/services/successMeasurementService';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { updateSuccessMetricSchema } from '@/lib/success/validation';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metric = await getMetricById(id);
    if (!metric) {
      return NextResponse.json({ error: 'Metric not found' }, { status: 404 });
    }

    return NextResponse.json(metric);
  } catch (error: any) {
    console.error('Error fetching metric:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metric', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return forbid();
    }

    // Additional capability check
    if (role !== 'SUPERADMIN') {
      const { data: me, error: userError } = await supabase
        .from('app_user')
        .select('roles')
        .eq('email', user.email)
        .single();

      if (userError && userError.code === 'PGRST116') {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
      }
      if (userError) {
        throw userError;
      }

      const rules = await getEffectivePermissionRules();
      const canUpdate = canRolesPerformWithRules((me?.roles as string[]) || [], 'criteria.update', rules);
      if (!canUpdate) {
        return forbid();
      }
    }

    // Validate request body
    const body = await req.json();
    const parsed = updateSuccessMetricSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const metric = await updateMetric(id, parsed.data);
    return NextResponse.json(metric);
  } catch (error: any) {
    console.error('Error updating metric:', error);
    if (error.message === 'Metric not found') {
      return NextResponse.json({ error: 'Metric not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to update metric', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return forbid();
    }

    // Additional capability check
    if (role !== 'SUPERADMIN') {
      const { data: me, error: userError } = await supabase
        .from('app_user')
        .select('roles')
        .eq('email', user.email)
        .single();

      if (userError && userError.code === 'PGRST116') {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
      }
      if (userError) {
        throw userError;
      }

      const rules = await getEffectivePermissionRules();
      const canDelete = canRolesPerformWithRules((me?.roles as string[]) || [], 'criteria.delete', rules);
      if (!canDelete) {
        return forbid();
      }
    }

    const deleted = await deleteMetric(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Metric not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Metric deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting metric:', error);
    if (error.message?.includes('referenced')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete metric', details: error.message },
      { status: 500 }
    );
  }
}

