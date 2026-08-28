import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';
import { isReadyToRatify } from '@/lib/story-brief/generator';

export const dynamic = 'force-dynamic';

/**
 * POST /api/epics/[id]/story-brief/ratify
 * Ratify the current draft to v1.0. Distinct capability from generate/edit — PMM is the
 * stated fact-check gatekeeper per Kristin's ask. Rejects (400) unless every open_decisions
 * item is 'resolved' or 'deferred' — this is the template's own rule made a real enforced gate,
 * not just a convention ("the brief goes to v1.0 only when this list is empty or explicitly
 * deferred"). Naming/pricing (Kristin's two commercialization gates) typically live here.
 */
async function postHandler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roles = [await resolveRole(userEmail)];
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules(roles, 'storyBrief.ratify', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data: appUser } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: brief, error: fetchError } = await supabase
      .from('epic_story_brief')
      .select('*')
      .eq('epic_id', id)
      .single();
    if (fetchError || !brief) {
      return NextResponse.json({ error: 'Story Brief not found. Generate one first.' }, { status: 404 });
    }

    const openDecisions = (brief.content?.open_decisions || []) as Array<{
      status?: 'open' | 'resolved' | 'deferred';
    }>;
    if (!isReadyToRatify(openDecisions)) {
      return NextResponse.json(
        {
          error: 'Cannot ratify: one or more open decisions are not resolved or deferred.',
          code: 'OPEN_DECISIONS_UNRESOLVED',
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('epic_story_brief')
      .update({
        status: 'ratified',
        brief_version: 'v1.0',
        ratified_by: appUser.id,
        ratified_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', brief.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('epic_story_brief_change_log').insert({
      epic_story_brief_id: brief.id,
      action: 'ratified',
      actor_email: userEmail,
      note: 'Ratified to v1.0.',
      snapshot: brief.content,
    });

    return NextResponse.json({ brief: updated });
  } catch (err: any) {
    console.error('[POST story-brief/ratify]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
