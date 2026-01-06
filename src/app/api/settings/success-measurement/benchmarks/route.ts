import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getBenchmarks, createBenchmark } from '@/lib/services/successMeasurementService';
import { createAdoptionBenchmarkSchema } from '@/lib/success/validation';

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
    const launch_tier = searchParams.get('launch_tier') as 'TIER_1' | 'TIER_2' | 'TIER_3' | null;
    const feature_type = searchParams.get('feature_type');
    const is_default = searchParams.get('is_default') === 'true' ? true : 
                      searchParams.get('is_default') === 'false' ? false : undefined;

    const filters = {
      ...(launch_tier && { launch_tier }),
      ...(feature_type && { feature_type }),
      ...(is_default !== undefined && { is_default }),
    };

    const benchmarks = await getBenchmarks(filters);
    return NextResponse.json(benchmarks);
  } catch (error: any) {
    console.error('Error fetching benchmarks:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error?.name);
    console.error('Error code:', error?.code);
    
    // Parse filters again for error logging
    try {
      const { searchParams } = new URL(req.url);
      const launch_tier = searchParams.get('launch_tier');
      const feature_type = searchParams.get('feature_type');
      const is_default = searchParams.get('is_default');
      console.error('Filters:', { launch_tier, feature_type, is_default });
    } catch {
      // Ignore if URL parsing fails
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch benchmarks', 
        details: error?.message || 'Unknown error',
        ...(process.env.NODE_ENV === 'development' && {
          stack: error?.stack,
          name: error?.name,
          code: error?.code
        })
      },
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
    const parsed = createAdoptionBenchmarkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const benchmark = await createBenchmark(parsed.data);
    return NextResponse.json(benchmark, { status: 201 });
  } catch (error: any) {
    console.error('Error creating benchmark:', error);
    return NextResponse.json(
      { error: 'Failed to create benchmark', details: error.message },
      { status: 500 }
    );
  }
}

