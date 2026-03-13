import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { generatePortfolioRetro } from '@/lib/ai/retro-generator';

export const maxDuration = 300;

/**
 * POST /api/ai-retro/global
 * Generate a portfolio-level AI retro across multiple epics.
 * Body: { epic_ids: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const epicIds: string[] = body.epic_ids || [];

    if (epicIds.length === 0) {
      return NextResponse.json({ error: 'epic_ids is required' }, { status: 400 });
    }

    if (epicIds.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 epics per portfolio retro' },
        { status: 400 }
      );
    }

    const { context, output } = await generatePortfolioRetro(epicIds);

    return NextResponse.json({
      retro: {
        generated_at: new Date().toISOString(),
        epic_count: epicIds.length,
        context_summary: {
          epics: context.epics.map((e) => ({
            id: e.epic.id,
            name: e.epic.name,
            tier: e.epic.tier,
            criteria_count: e.criteria.length,
            history_count: e.status_history.length,
            comments_count: e.comments.length,
          })),
        },
        output,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/ai-retro/global]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
