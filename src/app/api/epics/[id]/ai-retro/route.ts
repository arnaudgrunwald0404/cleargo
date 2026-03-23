import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { generateEpicRetro } from '@/lib/ai/retro-generator';

export const maxDuration = 120;

/**
 * GET /api/epics/[id]/ai-retro
 * Return the stored AI retro for an epic (if any).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from('epic_ai_retro')
      .select('*')
      .eq('epic_id', id)
      .maybeSingle();

    if (error) {
      console.error('[GET ai-retro]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ retro: data || null });
  } catch (err: any) {
    console.error('[GET ai-retro]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/epics/[id]/ai-retro
 * Generate (or regenerate) the AI retro for an epic.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();

    const { data: appUser } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { context, output } = await generateEpicRetro(id);

    const { data, error } = await supabase
      .from('epic_ai_retro')
      .upsert(
        {
          epic_id: id,
          generated_at: new Date().toISOString(),
          generated_by: appUser.id,
          context_snapshot: context,
          retro_output: output,
        },
        { onConflict: 'epic_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[POST ai-retro] upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ retro: data });
  } catch (err: any) {
    console.error('[POST ai-retro]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
