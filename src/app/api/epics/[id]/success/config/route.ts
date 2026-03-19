import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEpic } from '@/lib/epics';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
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
    // Return null instead of 404 for optional resource
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
    const rules = await getEffectivePermissionRules();
    const canConfigure = canRolesPerformWithRules(userRoles, 'settings.successMeasurement.update', rules);
    const isPM = userRoles.includes('PM');
    const isEpicOwner = epic.owner_id === me?.id;

    if (!canConfigure && !(isPM && isEpicOwner)) {
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

    // Note: Benchmark validation removed as benchmarks are no longer used

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
      ...(parsed.data.track_offline !== undefined ? { track_offline: parsed.data.track_offline } : {}),
    });

    // Note: Benchmark-based scorecard generation has been removed

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
    const rules = await getEffectivePermissionRules();
    const canConfigure = canRolesPerformWithRules(userRoles, 'settings.successMeasurement.update', rules);
    const isPM = userRoles.includes('PM');
    const isEpicOwner = epic.owner_id === me?.id;

    // If locked, only admins can update
    if (existing.locked && !canConfigure) {
      return NextResponse.json({ error: 'Configuration is locked. Only admins can modify locked configurations.' }, { status: 403 });
    }

    if (!canConfigure && !(isPM && isEpicOwner)) {
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

    // Note: Benchmark validation removed as benchmarks are no longer used

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

    // Note: Benchmark-based scorecard generation has been removed

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

