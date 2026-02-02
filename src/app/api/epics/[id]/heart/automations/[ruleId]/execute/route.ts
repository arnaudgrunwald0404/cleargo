import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import {
  evaluateRuleTrigger,
  executeAction,
  getTargetAudience,
} from '@/lib/heart';

interface RouteParams {
  params: Promise<{ id: string; ruleId: string }>;
}

/**
 * POST /api/epics/[id]/heart/automations/[ruleId]/execute
 * Manually trigger evaluation and execution of an automation rule
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
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

    const body = await req.json().catch(() => ({}));
    const { evaluateOnly = false, targetAudienceIds } = body;

    // Step 1: Evaluate the trigger and compute target audience
    const audienceMembers = await evaluateRuleTrigger(ruleId);

    if (evaluateOnly) {
      // Just return the audience without executing
      return NextResponse.json({
        success: true,
        audienceCount: audienceMembers.length,
        audienceMembers: audienceMembers.slice(0, 50), // Limit for display
      });
    }

    // Step 2: Execute the action
    const executions = await executeAction(ruleId, targetAudienceIds);

    // Step 3: Get updated audience
    const updatedAudience = await getTargetAudience(ruleId);

    return NextResponse.json({
      success: true,
      audienceCount: updatedAudience.length,
      executionsCount: executions.length,
      executions,
    });
  } catch (error: any) {
    console.error('Error executing happiness automation:', error);
    return NextResponse.json(
      { error: 'Failed to execute automation', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/epics/[id]/heart/automations/[ruleId]/execute
 * Get the current target audience for a rule (preview)
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

    const audience = await getTargetAudience(ruleId);

    return NextResponse.json({
      audienceCount: audience.length,
      audienceMembers: audience.slice(0, 100), // Limit for display
      actionedCount: audience.filter(a => a.has_been_actioned).length,
      convertedCount: audience.filter(a => a.converted_at).length,
    });
  } catch (error: any) {
    console.error('Error fetching target audience:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audience', details: error.message },
      { status: 500 }
    );
  }
}
