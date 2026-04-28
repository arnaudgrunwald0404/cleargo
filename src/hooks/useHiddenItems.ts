'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface HiddenItemRow {
  id: string;
  app_user_id: string;
  aha_key: string;
  hidden_at: string;
}

/**
 * Per-user hidden roadmap items. RLS scopes SELECT to the current user
 * (we still SELECT all here because the read policy is `using (true)`,
 * but writes are owner-only).
 */
export function useHiddenItems(appUserId: string | null | undefined) {
  return useQuery({
    queryKey: ['roadmap-hidden-items', appUserId],
    queryFn: async (): Promise<HiddenItemRow[]> => {
      if (!appUserId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('roadmap_hidden_item')
        .select('*')
        .eq('app_user_id', appUserId)
        .order('hidden_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as HiddenItemRow[];
    },
    enabled: Boolean(appUserId),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useHideRoadmapItem(appUserId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ahaKey: string) => {
      if (!appUserId) throw new Error('Not authenticated');
      const supabase = createClient();
      const { error } = await supabase.from('roadmap_hidden_item').insert({
        app_user_id: appUserId,
        aha_key: ahaKey,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roadmap-hidden-items', appUserId] });
    },
  });
}

export function useUnhideRoadmapItem(appUserId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ahaKey: string) => {
      if (!appUserId) throw new Error('Not authenticated');
      const supabase = createClient();
      const { error } = await supabase
        .from('roadmap_hidden_item')
        .delete()
        .eq('app_user_id', appUserId)
        .eq('aha_key', ahaKey);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roadmap-hidden-items', appUserId] });
    },
  });
}
