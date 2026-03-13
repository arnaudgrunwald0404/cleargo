#!/usr/bin/env npx tsx
/**
 * One-time backfill: reconstruct criterion_status_history from existing
 * criterion_comment rows that have status_at_comment and previous_status.
 *
 * Usage:  npx tsx scripts/backfill-criterion-status-history.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching comments with status transitions...');

  const { data: comments, error } = await supabase
    .from('criterion_comment')
    .select('id, launch_criterion_status_id, created_by_user_id, created_at, status_at_comment, previous_status')
    .not('status_at_comment', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching comments:', error);
    process.exit(1);
  }

  if (!comments || comments.length === 0) {
    console.log('No comments with status transitions found. Nothing to backfill.');
    return;
  }

  console.log(`Found ${comments.length} comments with status data.`);

  // Resolve epic_criterion_status rows to get epic_id and criterion_id
  const lcsIds = [...new Set(comments.map((c) => c.launch_criterion_status_id))];
  const { data: ecsRows, error: ecsError } = await supabase
    .from('epic_criterion_status')
    .select('id, epic_id, criterion_id')
    .in('id', lcsIds);

  if (ecsError) {
    console.error('Error fetching epic_criterion_status:', ecsError);
    process.exit(1);
  }

  const ecsMap = new Map((ecsRows || []).map((r) => [r.id, r]));

  // Check existing history to avoid duplicates
  const { data: existing } = await supabase
    .from('criterion_status_history')
    .select('epic_criterion_status_id, changed_at');

  const existingSet = new Set(
    (existing || []).map((e) => `${e.epic_criterion_status_id}::${e.changed_at}`)
  );

  const rows: Array<{
    epic_criterion_status_id: string;
    epic_id: string;
    criterion_id: string;
    old_status: string | null;
    new_status: string;
    changed_by: string | null;
    changed_at: string;
  }> = [];

  for (const c of comments) {
    const ecs = ecsMap.get(c.launch_criterion_status_id);
    if (!ecs) continue;

    const key = `${c.launch_criterion_status_id}::${c.created_at}`;
    if (existingSet.has(key)) continue;

    if (c.status_at_comment && c.status_at_comment !== c.previous_status) {
      rows.push({
        epic_criterion_status_id: c.launch_criterion_status_id,
        epic_id: ecs.epic_id,
        criterion_id: ecs.criterion_id,
        old_status: c.previous_status || null,
        new_status: c.status_at_comment,
        changed_by: c.created_by_user_id || null,
        changed_at: c.created_at,
      });
    }
  }

  if (rows.length === 0) {
    console.log('No new history rows to insert (all already backfilled or no transitions).');
    return;
  }

  console.log(`Inserting ${rows.length} history rows...`);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: insertError } = await supabase
      .from('criterion_status_history')
      .insert(batch);

    if (insertError) {
      console.error(`Error inserting batch at offset ${i}:`, insertError);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Done. Inserted ${inserted} history rows.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
