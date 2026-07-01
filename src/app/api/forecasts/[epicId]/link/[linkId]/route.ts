import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ epicId: string; linkId: string }> };

const RenameSchema = z.object({
  scenario: z.string().min(1).max(100),
});

// DELETE /api/forecasts/[epicId]/link/[linkId]
async function deleteHandler(_req: NextRequest, { params }: Params) {
  const userEmail = await getAuthenticatedUserEmail();
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { linkId } = await params;
  const adminSupabase = createAdminClient();

  const { error } = await adminSupabase
    .from('epic_forecast_link')
    .delete()
    .eq('id', linkId);

  if (error) {
    console.error('Error deleting forecast link:', error);
    return NextResponse.json({ error: 'Failed to delete forecast link' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/forecasts/[epicId]/link/[linkId]
// Body: { scenario: string }
async function patchHandler(req: NextRequest, { params }: Params) {
  const userEmail = await getAuthenticatedUserEmail();
  if (!userEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { linkId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from('epic_forecast_link')
    .update({ scenario: parsed.data.scenario })
    .eq('id', linkId)
    .select('id, scenario')
    .single();

  if (error) {
    console.error('Error renaming forecast link:', error);
    return NextResponse.json({ error: 'Failed to rename forecast link' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export const DELETE = withRateLimit(deleteHandler, RATE_LIMITS.default);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
