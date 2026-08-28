import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';
import { generateStoryBrief, toStoryBriefContent } from '@/lib/story-brief/generator';

export const dynamic = 'force-dynamic';
// Chains Jira epic-key resolution + getJiraEpic + a JQL search, then the LLM call, sequentially.
export const maxDuration = 180;

/**
 * GET /api/epics/[id]/story-brief
 * Return the current Story Brief for an epic (if any) plus its change log.
 */
async function getHandler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();
    const { data: brief, error } = await supabase
      .from('epic_story_brief')
      .select('*')
      .eq('epic_id', id)
      .maybeSingle();

    if (error) {
      console.error('[GET story-brief]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let changeLog: unknown[] = [];
    if (brief) {
      const { data: logRows } = await supabase
        .from('epic_story_brief_change_log')
        .select('*')
        .eq('epic_story_brief_id', brief.id)
        .order('created_at', { ascending: false });
      changeLog = logRows || [];
    }

    return NextResponse.json({ brief: brief || null, changeLog });
  } catch (err: any) {
    console.error('[GET story-brief]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

const GenerateBodySchema = z.object({
  sourceNotes: z.string().max(20000).optional(),
  confirmOverwrite: z.boolean().optional(),
});

/**
 * POST /api/epics/[id]/story-brief
 * Generate (or regenerate) the Story Brief for an epic. Runs Aha/Jira delivery validation,
 * then drafts all 8 sections via the generator. Regenerating a ratified brief requires
 * confirmOverwrite=true and reverts it to draft v0.1.
 */
async function postHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roles = [await resolveRole(userEmail)];
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules(roles, 'storyBrief.generate', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bodyJson = await req.json().catch(() => ({}));
    const parsed = GenerateBodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { sourceNotes, confirmOverwrite } = parsed.data;

    const supabase = createAdminClient();

    const { data: appUser } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: existing } = await supabase
      .from('epic_story_brief')
      .select('id, status')
      .eq('epic_id', id)
      .maybeSingle();

    if (existing?.status === 'ratified' && !confirmOverwrite) {
      return NextResponse.json(
        {
          error: 'This Story Brief has been ratified (v1.0). Regenerating will revert it to draft v0.1.',
          code: 'RATIFIED_OVERWRITE',
        },
        { status: 409 }
      );
    }

    const { context, output } = await generateStoryBrief(id, sourceNotes);
    const content = toStoryBriefContent(output);

    const nowIso = new Date().toISOString();
    const { data: brief, error } = await supabase
      .from('epic_story_brief')
      .upsert(
        {
          epic_id: id,
          status: 'draft',
          brief_version: 'v0.1',
          pm_owner_email: context.epic.owner_email,
          target_window: {
            announce_date: context.epic.target_launch_date,
            ga_date: context.epic.scheduled_ga_dev_date,
          },
          content,
          ai_draft: content,
          validation_snapshot: context.validation,
          context_snapshot: context,
          generated_at: nowIso,
          generated_by: appUser.id,
          ratified_by: null,
          ratified_at: null,
          updated_at: nowIso,
        },
        { onConflict: 'epic_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[POST story-brief] upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('epic_story_brief_change_log').insert({
      epic_story_brief_id: brief.id,
      action: 'generated',
      actor_email: userEmail,
      note: sourceNotes
        ? 'Generated from pasted notes/transcript plus Aha/Jira facts.'
        : 'Generated from Aha/Jira facts only (no notes provided).',
      snapshot: content,
    });

    return NextResponse.json({ brief });
  } catch (err: any) {
    console.error('[POST story-brief]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

const EditBodySchema = z.object({
  content: z.record(z.any()),
  note: z.string().min(1, 'A note describing what changed and why is required.'),
});

/**
 * PATCH /api/epics/[id]/story-brief
 * Save PM/PMM edits to the brief content. Requires a change-log note (Arnaud's ask: track
 * what changed and why, since briefs go through several revisions). Editing a ratified brief
 * reverts it to draft — edits require re-ratification.
 */
async function patchHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roles = [await resolveRole(userEmail)];
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules(roles, 'storyBrief.edit', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const bodyJson = await req.json().catch(() => ({}));
    const parsed = EditBodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { content, note } = parsed.data;

    const supabase = createAdminClient();
    const { data: existing, error: fetchError } = await supabase
      .from('epic_story_brief')
      .select('id, status')
      .eq('epic_id', id)
      .single();
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Story Brief not found. Generate one first.' }, { status: 404 });
    }

    const revertsRatification = existing.status === 'ratified';
    const nowIso = new Date().toISOString();
    const updates: Record<string, any> = { content, updated_at: nowIso };
    if (revertsRatification) {
      updates.status = 'draft';
      updates.brief_version = 'v0.1';
      updates.ratified_by = null;
      updates.ratified_at = null;
    }

    const { data: brief, error } = await supabase
      .from('epic_story_brief')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from('epic_story_brief_change_log').insert({
      epic_story_brief_id: existing.id,
      action: 'edited',
      actor_email: userEmail,
      note: revertsRatification ? `${note} (reverted to draft — edits require re-ratification)` : note,
      snapshot: content,
    });

    return NextResponse.json({ brief });
  } catch (err: any) {
    console.error('[PATCH story-brief]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.heavy);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
