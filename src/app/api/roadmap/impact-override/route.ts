/**
 * GET  /api/roadmap/impact-override?ahaKey=CC-EPIC-123
 * POST /api/roadmap/impact-override
 *   Body: { ahaKey, weekStart, originalImpact, overrideImpact, note? }
 *   Capability gated: roadmap.impactOverride.write
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ahaKey = new URL(req.url).searchParams.get('ahaKey');
  if (!ahaKey) return NextResponse.json({ error: 'ahaKey is required' }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from('pm_impact_override')
    .select('*')
    .eq('aha_key', ahaKey)
    .order('week_start', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overrides: data ?? [] });
}

const upsertSchema = z.object({
  ahaKey: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  originalImpact: z.enum(['high', 'medium', 'low']),
  overrideImpact: z.enum(['high', 'medium', 'low']),
  note: z.string().max(2000).optional(),
});

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  const { data: me, error: meErr } = await supabase
    .from('app_user')
    .select('roles')
    .eq('email', email)
    .single();
  if (meErr && (meErr as { code?: string }).code === 'PGRST116') {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 });

  const rules = await getEffectivePermissionRules();
  const allowed = canRolesPerformWithRules(
    ((me?.roles as string[]) || []),
    'roadmap.impactOverride.write',
    rules,
  );
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.format() }, { status: 400 });
  }
  const { ahaKey, weekStart, originalImpact, overrideImpact, note } = parsed.data;

  const { error } = await supabase
    .from('pm_impact_override')
    .upsert(
      {
        aha_key: ahaKey,
        week_start: weekStart,
        original_impact: originalImpact,
        override_impact: overrideImpact,
        override_note: note ?? null,
        author_email: email,
      },
      { onConflict: 'aha_key,week_start' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
