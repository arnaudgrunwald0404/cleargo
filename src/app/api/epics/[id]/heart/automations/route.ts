import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  createAutomationRule,
  listAutomationRules,
  type CreateHappinessAutomationRuleDTO,
} from '@/lib/heart';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/epics/[id]/heart/automations
 * List happiness automations for an epic
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return forbid();
    }

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const triggerType = url.searchParams.get('triggerType') || undefined;

    const rules = await listAutomationRules({
      epicId,
      status,
      triggerType,
    });

    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error('Error listing happiness automations:', error);
    return NextResponse.json(
      { error: 'Failed to list automations', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/epics/[id]/heart/automations
 * Create a new happiness automation for an epic
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return forbid();
    }

    const body = await req.json();
    
    const dto: CreateHappinessAutomationRuleDTO = {
      epic_id: epicId,
      epic_heart_metric_id: body.epic_heart_metric_id,
      name: body.name,
      description: body.description,
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config,
      action_type: body.action_type,
      action_config: body.action_config,
      is_recurring: body.is_recurring,
      recurrence_interval_days: body.recurrence_interval_days,
      max_executions_per_user: body.max_executions_per_user,
      cooldown_days: body.cooldown_days,
    };

    const rule = await createAutomationRule(dto, user.id);

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating happiness automation:', error);
    return NextResponse.json(
      { error: 'Failed to create automation', details: error.message },
      { status: 500 }
    );
  }
}
