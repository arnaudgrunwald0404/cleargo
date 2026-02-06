import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/epics';
import { getReleaseNameFromEpic, getEpicsForRelease } from '@/lib/services/releaseAnalyticsService';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    if (!epicId || !category) {
      return NextResponse.json(
        { error: 'epicId and category are required' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: tasks, error } = await supabase
      .from('epic_criterion_status')
      .select('id, criterion:criterion_id(category, gate)')
      .eq('epic_id', epicId);

    if (error) {
      console.error('Delegate counts fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch counts' }, { status: 500 });
    }

    const norm = (c: any) => (Array.isArray(c) ? c[0] : c);
    const inCategory = (task: any) => {
      const criterion = norm(task.criterion);
      return criterion && criterion.category === category;
    };
    const isGate = (task: any) => {
      const criterion = norm(task.criterion);
      return criterion && !!criterion.gate;
    };

    const categoryTasks = (tasks || []).filter(inCategory);
    const categoryExcludingGates = categoryTasks.filter((t) => !isGate(t)).length;
    const categoryIncludingGates = categoryTasks.length;

    let releaseCategoryIncludingGates = 0;
    let releaseName: string | null = null;
    const epic = await getEpic(epicId);
    if (epic) {
      releaseName = getReleaseNameFromEpic(epic as any);
      if (releaseName) {
        const releaseEpics = await getEpicsForRelease(releaseName, supabase);
        const releaseEpicIds = (releaseEpics || []).map((e: any) => e.id);
        if (releaseEpicIds.length > 0) {
          const { data: releaseTasks, error: releaseErr } = await supabase
            .from('epic_criterion_status')
            .select('id, criterion:criterion_id(category)')
            .in('epic_id', releaseEpicIds);
          if (!releaseErr && releaseTasks) {
            releaseCategoryIncludingGates = releaseTasks.filter((task: any) => {
              const criterion = norm(task.criterion);
              return criterion && criterion.category === category;
            }).length;
          }
        }
      }
    }

    return NextResponse.json({
      singleTask: 1,
      categoryExcludingGates,
      categoryIncludingGates,
      releaseCategoryIncludingGates,
      releaseName,
    });
  } catch (e) {
    console.error('Delegate counts error:', e);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
