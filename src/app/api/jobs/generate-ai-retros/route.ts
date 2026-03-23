/**
 * Scheduled job: Auto-generate AI retrospectives for epics that have
 * reached Released_GA but don't have an AI retro yet.
 *
 * Runs daily. Triggered via cron or manual workflow_dispatch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeEpicReleaseStatus } from '@/lib/epic-release-status';
import { generateEpicRetro } from '@/lib/ai/retro-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase service key' }, { status: 500 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseServiceKey
    );

    console.log('[generate-ai-retros] Starting...');

    // Fetch all non-archived, non-cancelled epics with a launch date
    const { data: epics, error: epicsErr } = await supabase
      .from('epic')
      .select('id, name, status, target_launch_date, scheduled_ga_dev_date, archived')
      .eq('archived', false)
      .not('target_launch_date', 'is', null);

    if (epicsErr) {
      console.error('[generate-ai-retros] Error fetching epics:', epicsErr);
      return NextResponse.json({ error: epicsErr.message }, { status: 500 });
    }

    if (!epics || epics.length === 0) {
      return NextResponse.json({ message: 'No epics found', generated: 0 });
    }

    // Fetch retros to compute Released_Retroed status
    const { data: retroRows } = await supabase
      .from('epic_retros')
      .select('epic_id, day_marker, status');

    const retrosByEpic = new Map<string, Array<{ day_marker: number; status: string }>>();
    (retroRows || []).forEach((r: any) => {
      const list = retrosByEpic.get(r.epic_id) || [];
      list.push({ day_marker: r.day_marker, status: r.status });
      retrosByEpic.set(r.epic_id, list);
    });

    // Find epics that have reached Released_GA or Released_Retroed
    const eligibleEpics = epics.filter((epic) => {
      const computed = computeEpicReleaseStatus(epic, retrosByEpic.get(epic.id) || []);
      return computed === 'Released_GA' || computed === 'Released_Retroed';
    });

    if (eligibleEpics.length === 0) {
      console.log('[generate-ai-retros] No epics at Released_GA or later.');
      return NextResponse.json({ message: 'No eligible epics', generated: 0 });
    }

    // Check which ones already have an AI retro
    const { data: existingRetros } = await supabase
      .from('epic_ai_retro')
      .select('epic_id')
      .in('epic_id', eligibleEpics.map((e) => e.id));

    const alreadyGenerated = new Set((existingRetros || []).map((r: any) => r.epic_id));

    const toGenerate = eligibleEpics.filter((e) => !alreadyGenerated.has(e.id));

    if (toGenerate.length === 0) {
      console.log('[generate-ai-retros] All eligible epics already have AI retros.');
      return NextResponse.json({ message: 'All up to date', generated: 0 });
    }

    console.log(`[generate-ai-retros] Generating retros for ${toGenerate.length} epics...`);

    let generated = 0;
    const errors: string[] = [];

    for (const epic of toGenerate) {
      try {
        const { context, output } = await generateEpicRetro(epic.id);

        const { error: upsertErr } = await supabase
          .from('epic_ai_retro')
          .upsert(
            {
              epic_id: epic.id,
              generated_at: new Date().toISOString(),
              generated_by: null,
              context_snapshot: context,
              retro_output: output,
            },
            { onConflict: 'epic_id' }
          );

        if (upsertErr) {
          console.error(`[generate-ai-retros] Upsert failed for ${epic.name}:`, upsertErr);
          errors.push(`${epic.name}: ${upsertErr.message}`);
        } else {
          generated++;
          console.log(`[generate-ai-retros] Generated retro for "${epic.name}"`);
        }
      } catch (err: any) {
        console.error(`[generate-ai-retros] Failed for "${epic.name}":`, err);
        errors.push(`${epic.name}: ${err?.message || 'Unknown'}`);
      }
    }

    console.log(`[generate-ai-retros] Done. Generated: ${generated}, Errors: ${errors.length}`);

    return NextResponse.json({
      generated,
      errors: errors.length > 0 ? errors : undefined,
      eligible: eligibleEpics.length,
      already_generated: alreadyGenerated.size,
    });
  } catch (err: any) {
    console.error('[generate-ai-retros] Fatal error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
