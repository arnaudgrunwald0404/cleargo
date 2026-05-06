/**
 * POST /api/roadmap/card-descriptions
 * Body: { snapshotDate: YYYY-MM-DD, items: { ahaKey, ahaName, ahaDescription }[] }
 * Returns cached AI blurbs per epic for that snapshot week (Claude; same model
 * fallback order as RRV — Haiku 4.5 first; requires CLAUDE_API_KEY or ANTHROPIC_API_KEY).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import {
  cleanEpicDescriptionForAi,
  generateCardDescriptionsForBatch,
} from '@/lib/roadmap/aiCardDescriptions';

export const dynamic = 'force-dynamic';

const itemSchema = z.object({
  ahaKey: z.string().min(1),
  ahaName: z.string(),
  ahaDescription: z.string().optional(),
});

const bodySchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(itemSchema).max(600),
});

const AI_CHUNK = 18;

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const email = await getAuthenticatedUserEmail();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { snapshotDate, items } = parsed.data;
  if (items.length === 0) {
    return NextResponse.json({ descriptions: {}, fromCache: true });
  }

  const admin = createAdminClient();
  const keys = [...new Set(items.map((i) => i.ahaKey))];

  const { data: cachedRows, error: cacheErr } = await admin
    .from('ai_description_cache')
    .select('aha_key, description')
    .eq('snapshot_date', snapshotDate)
    .in('aha_key', keys);

  if (cacheErr) {
    console.error('[card-descriptions] cache read', cacheErr);
    return NextResponse.json({ error: 'Cache read failed' }, { status: 500 });
  }

  const descriptions: Record<string, string> = {};
  for (const row of cachedRows ?? []) {
    const k = row.aha_key as string;
    const d = row.description as string;
    if (k && d) descriptions[k] = d;
  }

  const itemByKey = new Map(items.map((i) => [i.ahaKey, i]));
  const missingKeys = keys.filter((k) => !descriptions[k]);
  let generatedAny = false;

  try {
    for (let i = 0; i < missingKeys.length; i += AI_CHUNK) {
      const slice = missingKeys.slice(i, i + AI_CHUNK);
      const batchInputs = slice.map((k) => {
        const it = itemByKey.get(k)!;
        return {
          ahaKey: it.ahaKey,
          ahaName: it.ahaName,
          ahaDescription: cleanEpicDescriptionForAi(it.ahaDescription ?? ''),
        };
      });
      const generated = await generateCardDescriptionsForBatch(batchInputs);
      generatedAny = true;
      const rowsToUpsert = slice.map((k) => ({
        snapshot_date: snapshotDate,
        aha_key: k,
        description: generated[k] ?? itemByKey.get(k)?.ahaName ?? k,
      }));
      const { error: upsertErr } = await admin.from('ai_description_cache').upsert(rowsToUpsert, {
        onConflict: 'snapshot_date,aha_key',
      });
      if (upsertErr) {
        console.error('[card-descriptions] upsert', upsertErr);
        return NextResponse.json({ error: 'Cache write failed' }, { status: 500 });
      }
      for (const row of rowsToUpsert) {
        descriptions[row.aha_key] = row.description;
      }
    }
  } catch (e) {
    console.error('[card-descriptions] generate', e);
    const msg = e instanceof Error ? e.message : 'Generation failed';
    const status =
      /not configured|No Claude API key|No AI API key/i.test(msg) ? 503 : 500;
    return NextResponse.json({ error: msg, descriptions }, { status });
  }

  const fromCache = missingKeys.length === 0 && !generatedAny;
  return NextResponse.json({ descriptions, fromCache });
}

export const POST = withRateLimit(postHandler, RATE_LIMITS.heavy);
