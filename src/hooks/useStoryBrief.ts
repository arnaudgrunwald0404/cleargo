'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type { StoryBriefContent } from '@/lib/story-brief/generator';
import type { DeliveryValidationResult } from '@/lib/story-brief/delivery-validator';
import type { StoryBriefContext } from '@/lib/story-brief/context';

export interface StoryBriefRow {
  id: string;
  epic_id: string;
  story_code: string | null;
  brief_version: string;
  status: 'draft' | 'ratified';
  pm_owner_email: string | null;
  pmm_owner_email: string | null;
  prod_ed_owner_email: string | null;
  target_window: { announce_date?: string | null; ga_date?: string | null; note?: string | null };
  content: StoryBriefContent;
  ai_draft: StoryBriefContent;
  validation_snapshot: DeliveryValidationResult;
  context_snapshot: StoryBriefContext;
  generated_at: string | null;
  generated_by: string | null;
  ratified_by: string | null;
  ratified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryBriefChangeLogEntry {
  id: string;
  epic_story_brief_id: string;
  action: 'generated' | 'edited' | 'ratified';
  actor_email: string | null;
  note: string | null;
  created_at: string;
}

interface StoryBriefResponse {
  brief: StoryBriefRow | null;
  changeLog: StoryBriefChangeLogEntry[];
}

const queryKey = (epicId: string) => ['story-brief', epicId];

/** Read the current Story Brief + change log for an epic. All writes go through the API routes
 * (never a direct Supabase write) since epic_story_brief's RLS is permissive by design —
 * capability enforcement (storyBrief.generate/edit/ratify) lives server-side. */
export function useStoryBrief(epicId: string | null | undefined) {
  return useQuery({
    queryKey: queryKey(epicId || ''),
    queryFn: async (): Promise<StoryBriefResponse> => {
      const res = await fetchWithRateLimit(`/api/epics/${epicId}/story-brief`, { maxRetries: 1 });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load Story Brief');
      }
      return res.json();
    },
    enabled: Boolean(epicId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface GenerateStoryBriefArgs {
  sourceNotes?: string;
  confirmOverwrite?: boolean;
}

export function useGenerateStoryBrief(epicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: GenerateStoryBriefArgs = {}) => {
      const res = await fetch(`/api/epics/${epicId}/story-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(data.error || 'Failed to generate Story Brief') as Error & {
          code?: string;
          status?: number;
        };
        error.code = data.code;
        error.status = res.status;
        throw error;
      }
      return data.brief as StoryBriefRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(epicId) });
    },
  });
}

export interface SaveStoryBriefEditsArgs {
  content: StoryBriefContent;
  note: string;
}

export function useSaveStoryBriefEdits(epicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveStoryBriefEditsArgs) => {
      const res = await fetch(`/api/epics/${epicId}/story-brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save Story Brief edits');
      }
      return data.brief as StoryBriefRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(epicId) });
    },
  });
}

export function useRatifyStoryBrief(epicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/epics/${epicId}/story-brief/ratify`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(data.error || 'Failed to ratify Story Brief') as Error & { code?: string };
        error.code = data.code;
        throw error;
      }
      return data.brief as StoryBriefRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(epicId) });
    },
  });
}
