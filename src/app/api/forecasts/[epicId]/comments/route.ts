import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface ForecastComment {
  id: string;
  epic_aha_id: string;
  comment_text: string;
  created_by: string;
  created_at: string;
}

// GET /api/forecasts/[epicId]/comments
// Comments key off epic_aha_id (not a specific forecast_runs row) so a discussion thread
// persists across regenerated/versioned forecasts, matching how epic_comment attaches to
// the epic rather than any one snapshot of it.
async function getHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ epicId: string }> }
) {
  const userEmail = await getAuthenticatedUserEmail();
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { epicId: epicAhaId } = await params;
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from('forecast_comments')
    .select('id, epic_aha_id, comment_text, created_by, created_at')
    .eq('epic_aha_id', epicAhaId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch comments', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: data ?? [] });
}

// POST /api/forecasts/[epicId]/comments
async function postHandler(
  req: NextRequest,
  { params }: { params: Promise<{ epicId: string }> }
) {
  const userEmail = await getAuthenticatedUserEmail();
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { epicId: epicAhaId } = await params;
  const body = await req.json().catch(() => null);
  const commentText = (body?.comment_text as string | undefined)?.trim();

  if (!commentText) {
    return NextResponse.json({ error: 'comment_text is required' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from('forecast_comments')
    .insert({
      epic_aha_id: epicAhaId,
      comment_text: commentText,
      created_by: userEmail,
    })
    .select('id, epic_aha_id, comment_text, created_by, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to save comment', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ comment: data }, { status: 201 });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
