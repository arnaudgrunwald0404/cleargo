import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { trackActivityFromAction } from '@/lib/services/userActivityService';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** Email of the delegated accountable to remove (must match `app_user.email`). */
  accountableEmail: z.string().email(),
  /** Epics to scope the clear (URL segment after `/epics/`). */
  epicIds: z.array(z.string().uuid()).min(1).max(500),
  /** If set, only clear delegation on these criterion labels; otherwise all rows on those epics where this user is delegated. */
  criterionLabels: z.array(z.string().min(1)).max(100).optional(),
});

/**
 * Clears per-epic delegation (`decision_owner_id`) wherever it points at `accountableEmail`,
 * limited to the given epics (and optionally to specific criterion labels).
 */
export async function POST(req: NextRequest) {
  try {
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

    const { accountableEmail, epicIds, criterionLabels } = parsed.data;
    const uniqueEpicIds = [...new Set(epicIds)];

    const { data: targetUser, error: targetErr } = await supabase
      .from('app_user')
      .select('id, email')
      .ilike('email', accountableEmail.trim())
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!targetUser?.id) {
      return NextResponse.json(
        { error: 'No user found for accountableEmail', accountableEmail: accountableEmail.trim() },
        { status: 404 }
      );
    }

    let criterionIds: string[] | undefined;
    if (criterionLabels && criterionLabels.length > 0) {
      const labels = [...new Set(criterionLabels)];
      const { data: critRows, error: critErr } = await supabase
        .from('criterion')
        .select('id, label')
        .in('label', labels);

      if (critErr) throw critErr;

      const foundLabels = new Set((critRows || []).map((r) => r.label));
      const missing = labels.filter((l) => !foundLabels.has(l));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: 'Some criterion labels were not found', missingLabels: missing },
          { status: 400 }
        );
      }

      criterionIds = [...new Set((critRows || []).map((r) => r.id))];
    }

    let updateQuery = supabase
      .from('epic_criterion_status')
      .update({ decision_owner_id: null })
      .eq('decision_owner_id', targetUser.id)
      .in('epic_id', uniqueEpicIds);

    if (criterionIds && criterionIds.length > 0) {
      updateQuery = updateQuery.in('criterion_id', criterionIds);
    }

    const { data: updatedRows, error: updateError } = await updateQuery.select('id');

    if (updateError) throw updateError;

    const clearedIds = (updatedRows || []).map((r) => r.id);

    await supabase.from('audit_log').insert({
      actor_id: me.id,
      entity_type: 'delegation',
      entity_id: uniqueEpicIds[0],
      json_diff: {
        action: 'clear_accountable_delegation',
        cleared_for_user_id: targetUser.id,
        cleared_for_email: targetUser.email,
        epic_ids: uniqueEpicIds,
        criterion_labels: criterionLabels ?? null,
        cleared_status_ids: clearedIds,
        cleared_count: clearedIds.length,
      },
    });

    trackActivityFromAction(me.id).catch((err) => {
      console.error('[POST clear-accountable-delegation] Failed to track activity:', err);
    });

    return NextResponse.json({
      success: true,
      clearedForEmail: targetUser.email,
      clearedCount: clearedIds.length,
      clearedStatusIds: clearedIds,
      ...(clearedIds.length === 0
        ? {
            message:
              'No rows updated. That user may not be delegated on these epics/criteria, or delegation was already cleared.',
          }
        : {}),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[POST /api/criteria/clear-accountable-delegation]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
