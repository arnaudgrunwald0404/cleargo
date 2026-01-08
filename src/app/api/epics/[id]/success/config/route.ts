import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { getEpic } from '@/lib/epics';
import {
  getEpicSuccessConfig,
  createEpicSuccessConfig,
  updateEpicSuccessConfig,
} from '@/lib/services/successMeasurementService';
import {
  createEpicSuccessConfigSchema,
  updateEpicSuccessConfigSchema,
} from '@/lib/success/validation';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    if (!epicId) {
      return NextResponse.json({ error: 'Epic ID is required' }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('Auth error in success config GET:', authError);
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
    }
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getEpicSuccessConfig(epicId);
    if (!config) {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }

    return NextResponse.json(config);
  } catch (error: any) {
    console.error('Error fetching epic success config:', error);
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Error code:', error?.code);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch success configuration', 
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

    // Validate request body
    const body = await req.json();
    const parsed = createEpicSuccessConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Validate benchmark exists and matches epic tier if provided
    if (parsed.data.benchmark_id) {
      const { getBenchmarkById } = await import('@/lib/services/successMeasurementService');
      const benchmark = await getBenchmarkById(parsed.data.benchmark_id);
      if (!benchmark) {
        return NextResponse.json({ error: 'Benchmark not found' }, { status: 404 });
      }
      if (benchmark.launch_tier !== epic.tier) {
        return NextResponse.json(
          { error: `Benchmark tier (${benchmark.launch_tier}) does not match epic tier (${epic.tier})` },
          { status: 400 }
        );
      }
    }

    // Validate post-launch owner exists if provided (otherwise will be auto-resolved to PM)
    if (parsed.data.post_launch_owner) {
      const { data: owner, error: ownerError } = await supabase
        .from('app_user')
        .select('id')
        .eq('id', parsed.data.post_launch_owner)
        .single();

      if (ownerError || !owner) {
        return NextResponse.json({ error: 'Post-launch owner not found' }, { status: 404 });
      }
    }

    // Check if config already exists
    const existing = await getEpicSuccessConfig(epicId);
    if (existing) {
      return NextResponse.json({ error: 'Success configuration already exists. Use PATCH to update.' }, { status: 409 });
    }

    const config = await createEpicSuccessConfig(epicId, {
      ...(parsed.data.benchmark_id ? { benchmark_id: parsed.data.benchmark_id } : {}),
      ...(parsed.data.post_launch_owner ? { post_launch_owner: parsed.data.post_launch_owner } : {}),
    });

    // Auto-generate scorecards for benchmark horizon days if epic is launched
    try {
      const { generateScorecardsForBenchmarkHorizons } = await import('@/lib/services/scorecardGenerationService');
      await generateScorecardsForBenchmarkHorizons(epicId).catch((err) => {
        // Log but don't fail the request if scorecard generation fails
        console.warn('Failed to auto-generate scorecards after config creation:', err);
      });
    } catch (error) {
      // Ignore scorecard generation errors - config creation should still succeed
      console.warn('Error attempting to auto-generate scorecards:', error);
    }

    return NextResponse.json(config, { status: 201 });
  } catch (error: any) {
    console.error('Error creating epic success config:', error);
    return NextResponse.json(
      { error: 'Failed to create success configuration', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    // Check if config exists
    const existing = await getEpicSuccessConfig(epicId);
    if (!existing) {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }

    // Check permissions
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

    // If locked, only admins can update
    if (existing.locked && !isAdmin) {
      return NextResponse.json({ error: 'Configuration is locked. Only admins can modify locked configurations.' }, { status: 403 });
    }

    if (!isAdmin && !(isPM && isEpicOwner)) {
      return forbid();
    }

    // Validate request body
    const body = await req.json();
    const parsed = updateEpicSuccessConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Validate benchmark if provided
    if (parsed.data.benchmark_id) {
      const { getBenchmarkById } = await import('@/lib/services/successMeasurementService');
      const benchmark = await getBenchmarkById(parsed.data.benchmark_id);
      if (!benchmark) {
        return NextResponse.json({ error: 'Benchmark not found' }, { status: 404 });
      }
      if (benchmark.launch_tier !== epic.tier) {
        return NextResponse.json(
          { error: `Benchmark tier (${benchmark.launch_tier}) does not match epic tier (${epic.tier})` },
          { status: 400 }
        );
      }
    }

    // Validate post-launch owner if provided
    if (parsed.data.post_launch_owner) {
      const { data: owner, error: ownerError } = await supabase
        .from('app_user')
        .select('id')
        .eq('id', parsed.data.post_launch_owner)
        .single();

      if (ownerError || !owner) {
        return NextResponse.json({ error: 'Post-launch owner not found' }, { status: 404 });
      }
    }

    const config = await updateEpicSuccessConfig(epicId, parsed.data);

    // Auto-generate scorecards for benchmark horizon days if benchmark was updated and epic is launched
    if (parsed.data.benchmark_id) {
      try {
        const { generateScorecardsForBenchmarkHorizons } = await import('@/lib/services/scorecardGenerationService');
        await generateScorecardsForBenchmarkHorizons(epicId).catch((err: any) => {
          // Log but don't fail the request if scorecard generation fails
          console.warn('Failed to auto-generate scorecards after config update:', err);
        });
      } catch (error) {
        // Ignore scorecard generation errors - config update should still succeed
        console.warn('Error attempting to auto-generate scorecards:', error);
      }
    }

    return NextResponse.json(config);
  } catch (error: any) {
    console.error('Error updating epic success config:', error);
    if (error.message === 'Epic success config not found') {
      return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to update success configuration', details: error.message },
      { status: 500 }
    );
  }
}

