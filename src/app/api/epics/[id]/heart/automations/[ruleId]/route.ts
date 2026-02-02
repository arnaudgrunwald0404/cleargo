import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import {
  getAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  activateRule,
  pauseRule,
  type UpdateHappinessAutomationRuleDTO,
} from '@/lib/heart';

interface RouteParams {
  params: Promise<{ id: string; ruleId: string }>;
}

/**
 * GET /api/epics/[id]/heart/automations/[ruleId]
 * Get a specific happiness automation rule
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { ruleId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rule = await getAutomationRule(ruleId);
    
    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error('Error fetching happiness automation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch automation', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/epics/[id]/heart/automations/[ruleId]
 * Update a happiness automation rule
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { ruleId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    
    // Handle special actions
    if (body.action === 'activate') {
      const rule = await activateRule(ruleId, user.id);
      return NextResponse.json({ rule });
    }
    
    if (body.action === 'pause') {
      const rule = await pauseRule(ruleId);
      return NextResponse.json({ rule });
    }

    // Regular update
    const dto: UpdateHappinessAutomationRuleDTO = {
      name: body.name,
      description: body.description,
      trigger_config: body.trigger_config,
      action_config: body.action_config,
      status: body.status,
      is_recurring: body.is_recurring,
      recurrence_interval_days: body.recurrence_interval_days,
      max_executions_per_user: body.max_executions_per_user,
      cooldown_days: body.cooldown_days,
    };

    const rule = await updateAutomationRule(ruleId, dto);

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error('Error updating happiness automation:', error);
    return NextResponse.json(
      { error: 'Failed to update automation', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/epics/[id]/heart/automations/[ruleId]
 * Delete a happiness automation rule
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { ruleId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await deleteAutomationRule(ruleId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting happiness automation:', error);
    return NextResponse.json(
      { error: 'Failed to delete automation', details: error.message },
      { status: 500 }
    );
  }
}
