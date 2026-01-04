import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getMetrics, createMetric } from '@/lib/services/successMeasurementService';
import { createSuccessMetricSchema } from '@/lib/success/validation';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters for filtering
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') as 'ADOPTION' | 'REVENUE' | 'RETENTION' | 'ENABLEMENT' | 'FRICTION' | null;
    const source = searchParams.get('source') as 'PENDO' | 'SNOWFLAKE' | 'MANUAL' | null;
    const leading_or_lagging = searchParams.get('leading_or_lagging') as 'LEADING' | 'LAGGING' | null;

    const filters = {
      ...(category && { category }),
      ...(source && { source }),
      ...(leading_or_lagging && { leading_or_lagging }),
    };

    const metrics = await getMetrics(filters);
    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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
    const canCreate = canRolesPerform((me?.roles as string[]) || [], 'criteria.create');
    if (!canCreate && role !== 'SUPERADMIN') {
      return forbid();
    }

    // Validate request body
    const body = await req.json();
    const parsed = createSuccessMetricSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const metric = await createMetric(parsed.data);
    return NextResponse.json(metric, { status: 201 });
  } catch (error: any) {
    console.error('Error creating metric:', error);
    return NextResponse.json(
      { error: 'Failed to create metric', details: error.message },
      { status: 500 }
    );
  }
}

