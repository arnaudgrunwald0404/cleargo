import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/epics';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { trackActivityFromAction } from '@/lib/services/userActivityService';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  labels: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * Clears per-epic delegation (decision_owner_id) on epic_criterion_status rows so
 * the epic matrix falls back to the criterion template (decision_owner_email).
 */
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

    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('id, roles')
      .eq('email', user.email)
      .single();

    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) throw userError;
    if (!me?.id) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const rules = await getEffectivePermissionRules();
    const delegatorRoles = (me.roles as string[] | null) || [];
    const canDelegate = canRolesPerformWithRules(delegatorRoles, 'criteria.delegate', rules);
    if (!canDelegate) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to clear criterion delegation.' },
        { status: 403 }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const labels = [...new Set(parsed.data.labels)];

    const epic = await getEpic(epicId);
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    const { data: criteriaRows, error: critError } = await supabase
      .from('criterion')
      .select('id, label')
      .in('label', labels);

    if (critError) throw critError;

    const foundLabels = new Set((criteriaRows || []).map((r) => r.label));
    const missing = labels.filter((l) => !foundLabels.has(l));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Some criterion labels were not found', missingLabels: missing },
        { status: 400 }
      );
    }

    const criterionIds = [...new Set((criteriaRows || []).map((r) => r.id))];

    const { data: updatedRows, error: updateError } = await supabase
      .from('epic_criterion_status')
      .update({ decision_owner_id: null })
      .eq('epic_id', epicId)
      .in('criterion_id', criterionIds)
      .select('id');

    if (updateError) throw updateError;

    const clearedIds = (updatedRows || []).map((r) => r.id);

    await supabase.from('audit_log').insert({
      actor_id: me.id,
      entity_type: 'delegation',
      entity_id: epicId,
      json_diff: {
        action: 'clear_delegation_to_template',
        epic_id: epicId,
        epic_name: epic.name,
        labels,
        cleared_status_ids: clearedIds,
        cleared_count: clearedIds.length,
      },
    });

    trackActivityFromAction(me.id).catch((err) => {
      console.error('[POST clear-delegation] Failed to track activity:', err);
    });

    return NextResponse.json({
      success: true,
      clearedCount: clearedIds.length,
      clearedStatusIds: clearedIds,
      ...(clearedIds.length === 0
        ? {
            message:
              'No epic criterion rows were updated (already using template, or these criteria are not instantiated for this epic).',
          }
        : {}),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/epics/[id]/criteria/clear-delegation]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
