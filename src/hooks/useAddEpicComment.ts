'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PmNoteCauseNew } from '@/lib/roadmap/pmNoteCause';

export interface AddEpicCommentArgs {
  /** Aha key — we resolve to epic_id internally. */
  ahaKey: string;
  commentText: string;
  category?: 'general' | 'movement' | 'risk' | 'decision' | null;
  /** Required for PM roadmap notes (general + movement); stored in `movement_cause`. */
  movementCause: PmNoteCauseNew;
  /** ISO date or timestamptz for the movement we're annotating. */
  movementDate?: string | null;
  fromRelease?: string | null;
  toRelease?: string | null;
  relatedSnapshotDate?: string | null;
}

/**
 * Creates a row in `epic_comment` (the renamed RRV `pm_notes` table),
 * resolving `aha_key → epic_id` automatically.
 *
 * Authorization: the `epic_comment_insert_pm` RLS policy
 * (migration 20260430120000) restricts INSERT to users with role
 * PM, PRODUCT_OPS, CPO, or SUPERADMIN. Callers should also gate
 * the entry-point UI with `canEditRoadmap()` for a clean UX —
 * the RLS check is the authoritative gate.
 */
export function useAddEpicComment(currentUserId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: AddEpicCommentArgs) => {
      const text = args.commentText.trim();
      if (text.length === 0) throw new Error('Comment text cannot be empty');
      const supabase = createClient();

      const { data: epicRow, error: lookupErr } = await supabase
        .from('epic')
        .select('id')
        .eq('aha_id', args.ahaKey)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (!epicRow?.id) {
        throw new Error(
          `No matching epic found for aha key "${args.ahaKey}". Run the next snapshot ingest first.`,
        );
      }

      const { error: insertErr } = await supabase.from('epic_comment').insert({
        epic_id: (epicRow as { id: string }).id,
        comment_text: text,
        category: args.category ?? (args.movementDate ? 'movement' : 'general'),
        movement_cause: args.movementCause,
        movement_date: args.movementDate ?? null,
        from_release: args.fromRelease ?? null,
        to_release: args.toRelease ?? null,
        related_snapshot_date: args.relatedSnapshotDate ?? null,
        created_by: currentUserId ?? null,
      });
      if (insertErr) throw insertErr;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['epic-comments', vars.ahaKey] });
    },
  });
}
