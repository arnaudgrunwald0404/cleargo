import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getBenchmarkById, updateBenchmark, deleteBenchmark } from '@/lib/services/successMeasurementService';
import { updateAdoptionBenchmarkSchema } from '@/lib/success/validation';

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

    const benchmark = await getBenchmarkById(id);
    if (!benchmark) {
      return NextResponse.json({ error: 'Benchmark not found' }, { status: 404 });
    }

    return NextResponse.json(benchmark);
  } catch (error: any) {
    console.error('Error fetching benchmark:', error);
    return NextResponse.json(
      { error: 'Failed to fetch benchmark', details: error.message },
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

      const { canRolesPerform } = await import('@/lib/permissions');
      const canUpdate = canRolesPerform((me?.roles as string[]) || [], 'criteria.update');
      if (!canUpdate) {
        return forbid();
      }
    }

    // Validate request body
    const body = await req.json();
    const parsed = updateAdoptionBenchmarkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const benchmark = await updateBenchmark(id, parsed.data);
    return NextResponse.json(benchmark);
  } catch (error: any) {
    console.error('Error updating benchmark:', error);
    if (error.message === 'Benchmark not found') {
      return NextResponse.json({ error: 'Benchmark not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to update benchmark', details: error.message },
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

      const { canRolesPerform } = await import('@/lib/permissions');
      const canDelete = canRolesPerform((me?.roles as string[]) || [], 'criteria.delete');
      if (!canDelete) {
        return forbid();
      }
    }

    const deleted = await deleteBenchmark(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Benchmark not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Benchmark deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting benchmark:', error);
    if (error.message?.includes('referenced')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete benchmark', details: error.message },
      { status: 500 }
    );
  }
}

