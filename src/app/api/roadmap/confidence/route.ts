/**
 * GET  /api/roadmap/confidence?ahaKey=CC-EPIC-123
 *   Returns confidence_rating history for an epic (newest first).
 *
 * POST /api/roadmap/confidence
 *   Body: { ahaKey, snapshotDate, newAdjustment, note? }
 *   Updates pm_adjustment + recalculates final_*; appends a row to
 *   confidence_adjustment_history. Capability gated: roadmap.confidence.adjust.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { adjustConfidenceRating } from '@/lib/roadmap/confidenceWrite';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ahaKey = new URL(req.url).searchParams.get('ahaKey');
  if (!ahaKey) return NextResponse.json({ error: 'ahaKey is required' }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from('confidence_rating')
    .select(
      'id, aha_key, snapshot_date, calculated_confidence, calculated_percentage, pm_adjustment, final_confidence, final_percentage, last_calculated_at, author_email, created_at, updated_at',
    )
    .eq('aha_key', ahaKey)
    .order('snapshot_date', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ratings: data ?? [] });
}

const adjustSchema = z.object({
  ahaKey: z.string().min(1),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newAdjustment: z.number().int().min(-20).max(20),
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
    'roadmap.confidence.adjust',
    rules,
  );
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = adjustSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.format() }, { status: 400 });
  }
  const { ahaKey, snapshotDate, newAdjustment, note } = parsed.data;

  const result = await adjustConfidenceRating(supabase, {
    ahaKey,
    snapshotDate,
    newAdjustment,
    note,
    authorEmail: email,
  });

  if (result.outcome === 'not_found') {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  if (result.outcome === 'failed') {
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    final_percentage: result.finalPercentage,
    final_confidence: result.finalConfidence,
  });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
