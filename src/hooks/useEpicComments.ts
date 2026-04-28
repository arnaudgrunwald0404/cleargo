'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * PM/movement comments for an epic, taken from `epic_comment` (the renamed
 * RRV `pm_notes` table). Looked up by `aha_key` so callers don't need to
 * resolve the epic UUID first.
 */
export interface EpicCommentRow {
  id: string;
  epic_id: string;
  comment_text: string;
  created_at: string;
  updated_at: string;
  category: 'general' | 'movement' | 'risk' | 'decision' | null;
  movement_cause: 'Internal' | 'External' | null;
  movement_date: string | null;
  from_release: string | null;
  to_release: string | null;
  related_snapshot_date: string | null;
  /** Joined from app_user via created_by (when available). */
  author_email: string | null;
}

interface RawCommentRow {
  id: string;
  comment_text: string;
  created_at: string;
  updated_at: string;
  category: 'general' | 'movement' | 'risk' | 'decision' | null;
  movement_cause: 'Internal' | 'External' | null;
  movement_date: string | null;
  from_release: string | null;
  to_release: string | null;
  related_snapshot_date: string | null;
  epic: { id: string; aha_id: string | null } | { id: string; aha_id: string | null }[] | null;
  author: { email: string | null } | { email: string | null }[] | null;
}

export function useEpicComments(ahaKey: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['epic-comments', ahaKey],
    queryFn: async (): Promise<EpicCommentRow[]> => {
      if (!ahaKey) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('epic_comment')
        .select(
          'id, comment_text, created_at, updated_at, category, movement_cause, movement_date, from_release, to_release, related_snapshot_date, epic:epic_id!inner(id, aha_id), author:created_by(email)',
        )
        .eq('epic.aha_id', ahaKey)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const pickFirst = <T>(v: T | T[] | null): T | null =>
        Array.isArray(v) ? (v[0] ?? null) : v;

      return ((data ?? []) as RawCommentRow[]).map((row) => {
        const epic = pickFirst(row.epic);
        const author = pickFirst(row.author);
        return {
          id: row.id,
          epic_id: epic?.id ?? '',
          comment_text: row.comment_text,
          created_at: row.created_at,
          updated_at: row.updated_at,
          category: row.category,
          movement_cause: row.movement_cause,
          movement_date: row.movement_date,
          from_release: row.from_release,
          to_release: row.to_release,
          related_snapshot_date: row.related_snapshot_date,
          author_email: author?.email ?? null,
        };
      });
    },
    enabled: enabled && Boolean(ahaKey),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
